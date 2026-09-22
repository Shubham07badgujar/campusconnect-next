// Exam reminder announcement job — ported verbatim from the legacy monolith
// (backend/server.js ~3358-3609 and ~9926-9945). The scheduler shell keeps its
// original exported names and globalThis double-start guard.
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import {
  getExamTimeStartMinutes,
  parseExamTimetableDate,
} from "@/lib/server/exam-timetable";
import { logger, reportError } from "./logger";

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SCHEDULER_KEY = Symbol.for("campusconnect.exam-reminder-scheduler");

const EXAM_REMINDER_ENABLED =
  String(process.env.ENABLE_EXAM_REMINDER_NOTIFICATIONS || "true")
    .trim()
    .toLowerCase() !== "false";

export const normalizeExamReminderYearToken = (value: any = "") =>
  String(value || "").replace(/[^0-9]/g, "");

export const toDayStart = (value: any) => {
  const current = value instanceof Date ? new Date(value) : new Date(value);
  current.setHours(0, 0, 0, 0);
  return current;
};

export const formatExamReminderDisplayDate = (value: any) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const formatExamReminderLocalDateISO = (value: any) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const findNextActiveExamDate = async (firestore: any) => {
  const snapshot = await firestore.collection("examTimetable").get();
  const todayStart = toDayStart(new Date());

  let nextDate: any = null;
  snapshot.docs.forEach((docSnap: any) => {
    const exam = docSnap.data() || {};
    if (exam.isActive === false) {
      return;
    }

    const parsed = parseExamTimetableDate(exam.date || "");
    if (!parsed) {
      return;
    }

    const examStart = toDayStart(parsed);
    if (examStart < todayStart) {
      return;
    }

    if (!nextDate || examStart < nextDate) {
      nextDate = examStart;
    }
  });

  return nextDate;
};

export const buildExamReminderMessage = ({
  yearLabel = "",
  displayDate = "",
  rows = [],
}: any) => {
  const groupedByBranch = new Map();

  rows.forEach((row: any) => {
    const branchName =
      String(row.branch || "All Branches").trim() || "All Branches";
    if (!groupedByBranch.has(branchName)) {
      groupedByBranch.set(branchName, []);
    }
    groupedByBranch.get(branchName).push(row);
  });

  const segments: any[] = [];
  segments.push(
    `Reminder: ${yearLabel || "Selected"} Year exam(s) are scheduled for tomorrow (${displayDate}).`,
  );
  segments.push(
    "Please be present before reporting time with valid college ID.",
  );
  segments.push("");
  segments.push("Exam Details:");

  Array.from(groupedByBranch.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([branchName, branchRows]) => {
      segments.push(`- ${branchName}:`);

      branchRows
        .slice()
        .sort((left: any, right: any) => {
          const leftTime = getExamTimeStartMinutes(left.time || "");
          const rightTime = getExamTimeStartMinutes(right.time || "");
          if (leftTime !== rightTime) {
            return leftTime - rightTime;
          }

          return String(left.courseCode || "").localeCompare(
            String(right.courseCode || ""),
          );
        })
        .forEach((exam: any) => {
          segments.push(
            `  • ${String(exam.time || "").trim() || "Time TBA"} | ${String(exam.courseCode || "").trim()} - ${String(exam.courseName || "").trim()}`,
          );
        });
    });

  return segments.join("\n");
};

export const createTomorrowExamReminderAnnouncements = async (options: any = {}) => {
  if (!EXAM_REMINDER_ENABLED) {
    return { createdCount: 0, skippedCount: 0, reason: "disabled" };
  }

  const firestore = adminApp.firestore();
  const now = new Date();
  const todayStart = toDayStart(now);
  const targetDateISO = String(options.targetDateISO || "").trim();

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  let reminderDayStart = tomorrowStart;
  if (targetDateISO) {
    const parsedTargetDate = parseExamTimetableDate(targetDateISO);
    if (!parsedTargetDate) {
      throw new Error("Invalid targetDateISO. Use DD-MM-YYYY or YYYY-MM-DD.");
    }

    reminderDayStart = toDayStart(parsedTargetDate);
  }

  const dayAfterTomorrowStart = new Date(reminderDayStart);
  dayAfterTomorrowStart.setDate(dayAfterTomorrowStart.getDate() + 1);

  const reminderDateIso = formatExamReminderLocalDateISO(reminderDayStart);

  const [examSnapshot, existingReminderSnapshot] = await Promise.all([
    firestore.collection("examTimetable").get(),
    firestore
      .collection("announcements")
      .where("reminderType", "==", "exam-day-1")
      .where("reminderDateISO", "==", reminderDateIso)
      .get(),
  ]);

  const existingYearKeys = new Set(
    existingReminderSnapshot.docs.map((docSnap: any) => {
      const payload = docSnap.data() || {};
      return normalizeExamReminderYearToken(
        payload.reminderYear || payload.year || "",
      );
    }),
  );

  const examsByYear = new Map();

  examSnapshot.docs.forEach((docSnap: any) => {
    const exam = docSnap.data() || {};
    if (exam.isActive === false) {
      return;
    }

    const parsedDate = parseExamTimetableDate(exam.date || "");
    if (!parsedDate) {
      return;
    }

    if (parsedDate < reminderDayStart || parsedDate >= dayAfterTomorrowStart) {
      return;
    }

    const yearLabel = String(exam.year || "").trim();
    const yearToken = normalizeExamReminderYearToken(yearLabel);
    if (!yearToken) {
      return;
    }

    if (!examsByYear.has(yearToken)) {
      examsByYear.set(yearToken, {
        yearLabel,
        rows: [],
      });
    }

    examsByYear.get(yearToken).rows.push({
      branch: exam.branch || "",
      time: exam.time || "",
      courseCode: exam.courseCode || "",
      courseName: exam.courseName || "",
    });
  });

  if (examsByYear.size === 0) {
    return {
      createdCount: 0,
      skippedCount: 0,
      reason: targetDateISO ? "no-exams-on-target-date" : "no-exams-tomorrow",
      reminderDateISO: reminderDateIso,
    };
  }

  const batch = firestore.batch();
  let createdCount = 0;
  let skippedCount = 0;

  examsByYear.forEach((group: any, yearToken: any) => {
    if (existingYearKeys.has(yearToken)) {
      skippedCount += 1;
      return;
    }

    const displayDate = formatExamReminderDisplayDate(reminderDayStart);
    const title = `Exam Reminder: ${group.yearLabel || `${yearToken}th`} Year (${displayDate})`;
    const message = buildExamReminderMessage({
      yearLabel: group.yearLabel || `${yearToken}th`,
      displayDate,
      rows: group.rows,
    });

    const reminderKey = `exam-reminder-${reminderDateIso}-${yearToken}`;
    const docRef = firestore.collection("announcements").doc();
    batch.set(docRef, {
      title,
      message,
      type: "academic",
      active: true,
      readBy: [],
      createdAt: FieldValue.serverTimestamp(),
      reminderType: "exam-day-1",
      reminderDateISO: reminderDateIso,
      reminderYear: group.yearLabel || `${yearToken}th`,
      reminderYearToken: yearToken,
      reminderKey,
      audience: ["student", "teacher"],
      source: "examReminderScheduler",
    });

    createdCount += 1;
  });

  if (createdCount > 0) {
    await batch.commit();
  }

  return {
    createdCount,
    skippedCount,
    reason: targetDateISO ? "ok-target-date" : "ok",
    reminderDateISO: reminderDateIso,
  };
};

let examReminderJobRunning = false;

export async function runExamReminderJob(): Promise<{ created: number }> {
  if (examReminderJobRunning) {
    return { created: 0 };
  }

  examReminderJobRunning = true;
  try {
    const result = await createTomorrowExamReminderAnnouncements();
    if ((result?.createdCount || 0) > 0) {
      logger.info("Exam reminder announcements created", {
        event: "examReminders.created",
        count: result.createdCount,
        reminderDate: result.reminderDateISO || "tomorrow",
      });
    }
    return { created: result?.createdCount || 0 };
  } catch (error) {
    reportError("Exam reminder job failed", error, {
      event: "examReminders.failed",
    });
    return { created: 0 };
  } finally {
    examReminderJobRunning = false;
  }
}

export function startExamReminderScheduler(): void {
  const globalStore = globalThis as Record<symbol, unknown>;
  if (globalStore[SCHEDULER_KEY]) {
    return; // already running (dev restarts)
  }

  const intervalMs =
    Number(process.env.EXAM_REMINDER_INTERVAL_MS) || DEFAULT_INTERVAL_MS;

  const timer = setInterval(() => {
    runExamReminderJob().catch((error) =>
      reportError("Exam reminder job failed", error, {
        event: "examReminders.failed",
      }),
    );
  }, intervalMs);
  timer.unref();

  globalStore[SCHEDULER_KEY] = timer;
  logger.info("Exam reminder scheduler started", {
    event: "scheduler.started",
    scheduler: "exam-reminders",
    intervalMs,
  });
}
