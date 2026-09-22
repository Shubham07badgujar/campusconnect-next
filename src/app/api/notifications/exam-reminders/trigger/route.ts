import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";
import {
  createTomorrowExamReminderAnnouncements,
  findNextActiveExamDate,
  formatExamReminderLocalDateISO,
} from "@/lib/server/exam-reminders";
import { reportError } from "@/lib/server/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json().catch(() => ({}));
    const requestedTargetDateISO = String(body?.targetDateISO || "").trim();
    const useNextExamDate = Boolean(body?.useNextExamDate);

    let targetDateISO = requestedTargetDateISO;
    if (!targetDateISO && useNextExamDate) {
      const nextDate = await findNextActiveExamDate(adminApp.firestore());
      if (nextDate) {
        targetDateISO = formatExamReminderLocalDateISO(nextDate);
      }
    }

    const result = await createTomorrowExamReminderAnnouncements({
      targetDateISO,
    });

    return NextResponse.json({
      success: true,
      message: "Exam reminder trigger completed",
      mode: targetDateISO ? "target-date" : "tomorrow",
      targetDateISO: targetDateISO || null,
      ...result,
    });
  } catch (error: any) {
    reportError("Exam reminder trigger failed", error, {
      route: "/api/notifications/exam-reminders/trigger",
    });
    return NextResponse.json(
      {
        message: "Failed to trigger exam reminders",
        error: error.message,
      },
      { status: 500 },
    );
  }
}
