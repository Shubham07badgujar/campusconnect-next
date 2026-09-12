import { NextRequest, NextResponse } from "next/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import { requireTeacher } from "@/lib/server/auth-guards";
import {
  normalizeBranch,
  normalizeSemester,
  normalizeYear,
} from "@/lib/server/constants";
import {
  makeSubjectId,
  parseTimeToMinutes,
} from "@/lib/server/attendance/shared";
import { isTimeRangeOverlapping } from "@/lib/server/attendance/ops-helpers";
import { getSubjectSetsMap } from "@/lib/server/subject-sets";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireTeacher(req);
  if (g.ok === false) return g.response;

  try {
    const teacherDoc = g.teacherDoc;
    const teacherData: Record<string, any> = teacherDoc.exists
      ? teacherDoc.data() || {}
      : {};
    const teacherId = g.uid;

    const body: Record<string, any> = await req.json().catch(() => ({}));

    const branch = normalizeBranch(body.branch || "");
    const year = normalizeYear(body.year || "");
    const semester = normalizeSemester(body.semester || "");
    const day = String(body.day || "").trim();
    const startTime = String(body.startTime || "").trim();
    const endTime = String(body.endTime || "").trim();
    const subjectName = String(body.subjectName || body.subject || "").trim();

    if (
      !branch ||
      !year ||
      !semester ||
      !day ||
      !startTime ||
      !endTime ||
      !subjectName
    ) {
      return NextResponse.json(
        {
          message:
            "Branch, year, semester, day, startTime, endTime and subjectName are required.",
        },
        { status: 400 },
      );
    }

    const validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    if (!validDays.includes(day)) {
      return NextResponse.json(
        {
          message:
            "Day must be one of Monday, Tuesday, Wednesday, Thursday or Friday.",
        },
        { status: 400 },
      );
    }

    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) {
      return NextResponse.json(
        { message: "Invalid startTime/endTime format." },
        { status: 400 },
      );
    }
    if (startMinutes >= endMinutes) {
      return NextResponse.json(
        { message: "endTime must be after startTime." },
        { status: 400 },
      );
    }

    const subjectSetsMap = await getSubjectSetsMap();
    const semesterSubjects = subjectSetsMap?.[branch]?.[year]?.[semester] || [];
    if (!semesterSubjects.includes(subjectName)) {
      return NextResponse.json(
        {
          message:
            "Selected subject is not part of the configured subject set for branch/year/semester.",
        },
        { status: 400 },
      );
    }

    const teacherAssignments: Record<string, any>[] = Array.isArray(
      teacherData.assignments,
    )
      ? teacherData.assignments
      : [];
    const assignment = teacherAssignments.find(
      (item) =>
        normalizeBranch(item?.branch || item?.dept || "") === branch &&
        normalizeYear(item?.year || "") === year,
    );

    if (!assignment || !Array.isArray(assignment.subjects)) {
      return NextResponse.json(
        { message: "Teacher is not assigned to the selected branch/year." },
        { status: 403 },
      );
    }

    if (!assignment.subjects.includes(subjectName)) {
      return NextResponse.json(
        { message: "Teacher is not authorized for the selected subject." },
        { status: 403 },
      );
    }

    const firestore = adminApp.firestore();

    const classSnapshot = await firestore
      .collection("timetables")
      .where("branch", "==", branch)
      .where("year", "==", year)
      .where("semester", "==", semester)
      .where("day", "==", day)
      .get();

    for (const docSnap of classSnapshot.docs) {
      const existing: Record<string, any> = docSnap.data() || {};
      const existingStart = parseTimeToMinutes(existing.startTime || "");
      const existingEnd = parseTimeToMinutes(existing.endTime || "");

      if (Number.isNaN(existingStart) || Number.isNaN(existingEnd)) {
        continue;
      }

      if (
        isTimeRangeOverlapping(
          startMinutes,
          endMinutes,
          existingStart,
          existingEnd,
        )
      ) {
        return NextResponse.json(
          {
            message:
              "Lecture overlap detected. This branch/year/semester slot is already occupied.",
            conflictLecture: {
              lectureId: existing.lectureId || docSnap.id,
              subjectName: existing.subjectName || existing.subject || "",
              teacherName: existing.teacherName || "",
              day: existing.day || day,
              startTime: existing.startTime || "",
              endTime: existing.endTime || "",
            },
          },
          { status: 409 },
        );
      }
    }

    const teacherDaySnapshot = await firestore
      .collection("timetables")
      .where("teacherId", "==", teacherId)
      .where("day", "==", day)
      .get();

    for (const docSnap of teacherDaySnapshot.docs) {
      const existing: Record<string, any> = docSnap.data() || {};
      const existingStart = parseTimeToMinutes(existing.startTime || "");
      const existingEnd = parseTimeToMinutes(existing.endTime || "");

      if (Number.isNaN(existingStart) || Number.isNaN(existingEnd)) {
        continue;
      }

      if (
        isTimeRangeOverlapping(
          startMinutes,
          endMinutes,
          existingStart,
          existingEnd,
        )
      ) {
        return NextResponse.json(
          {
            message: "Teacher has another lecture overlapping this slot.",
            conflictLecture: {
              lectureId: existing.lectureId || docSnap.id,
              branch: existing.branch || "",
              year: existing.year || "",
              semester: existing.semester || "",
              day: existing.day || day,
              startTime: existing.startTime || "",
              endTime: existing.endTime || "",
            },
          },
          { status: 409 },
        );
      }
    }

    const lectureRef = firestore.collection("timetables").doc();
    const lectureId = lectureRef.id;
    const teacherName =
      teacherData.fullName || teacherData.name || g.token.name || "Teacher";

    const payload = {
      lectureId,
      subjectId: makeSubjectId(subjectName),
      subjectName,
      teacherId,
      teacherName,
      branch,
      year,
      semester,
      day,
      startTime,
      endTime,
      createdAt: FieldValue.serverTimestamp(),
    };

    await lectureRef.set(payload);

    return NextResponse.json(
      {
        success: true,
        message: "Lecture added successfully.",
        lecture: payload,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}
