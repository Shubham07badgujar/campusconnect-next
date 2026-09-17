import { NextRequest, NextResponse } from "next/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import { requireTeacher } from "@/lib/server/auth-guards";
import {
  ATTENDANCE_ALLOWED_DISTANCE_METERS,
  ATTENDANCE_WINDOW_SECONDS,
  ATTENDANCE_WINDOW_SLOT_SECONDS,
  normalizeBranch,
  normalizeSemester,
  normalizeYear,
} from "@/lib/server/constants";
import {
  getAttendanceSettings,
  getSessionEnrolledStudents,
  makeSubjectId,
  normalizeSubjectValues,
  subjectMatches,
} from "@/lib/server/attendance/shared";
import {
  getAttendanceSessionJoinMap,
  getIO,
} from "@/lib/server/socket-io";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireTeacher(req);
  if (g.ok === false) return g.response;

  try {
    const teacherDoc = g.teacherDoc;
    const teacherData: Record<string, any> = teacherDoc.exists
      ? teacherDoc.data() || {}
      : {};
    const firestore = adminApp.firestore();
    const attendanceSettings = await getAttendanceSettings(firestore);

    const body: Record<string, any> = await req.json().catch(() => ({}));

    const lectureIdInput = String(body.lectureId || "").trim();
    const date = String(body.date || new Date().toISOString().slice(0, 10));
    const subjectNameInput = String(body.subjectName || "").trim();
    const subjectIdInput = String(body.subjectId || "").trim();
    const branchInput = normalizeBranch(body.branch || "");
    const yearInput = normalizeYear(body.year || "");
    const semesterInput = normalizeSemester(body.semester || "");
    const requestedWindowSeconds = Number(body.attendanceWindowSeconds);
    const teacherLocationCandidate = {
      lat: Number(body?.teacherLocation?.lat),
      lng: Number(body?.teacherLocation?.lng),
    };
    const hasValidTeacherLocation =
      !Number.isNaN(teacherLocationCandidate.lat) &&
      !Number.isNaN(teacherLocationCandidate.lng);
    const enforceDistanceCheck =
      typeof body.enforceDistanceCheck === "boolean"
        ? body.enforceDistanceCheck
        : attendanceSettings.distanceEnforcementDefault;
    const teacherLocation = hasValidTeacherLocation
      ? teacherLocationCandidate
      : null;

    const attendanceWindowSeconds = ATTENDANCE_WINDOW_SLOT_SECONDS.includes(
      requestedWindowSeconds,
    )
      ? requestedWindowSeconds
      : ATTENDANCE_WINDOW_SECONDS;

    if (enforceDistanceCheck && !teacherLocation) {
      return NextResponse.json(
        { message: "Valid teacher location is required." },
        { status: 400 },
      );
    }

    let resolvedBranch = "";
    let resolvedYear = "";
    let resolvedSemester = "";
    let subjectName = "";
    let subjectId = "";
    let lectureDay = "";
    let lectureStartTime = "";
    let lectureEndTime = "";

    if (lectureIdInput) {
      const lectureDoc = await firestore
        .collection("timetables")
        .doc(lectureIdInput)
        .get();

      if (!lectureDoc.exists) {
        return NextResponse.json(
          { message: "Selected lecture not found." },
          { status: 404 },
        );
      }

      const lectureData: Record<string, any> = lectureDoc.data() || {};
      if (String(lectureData.teacherId || "") !== g.uid) {
        return NextResponse.json(
          {
            message:
              "You can only start attendance for your own timetable lectures.",
          },
          { status: 403 },
        );
      }

      subjectName = String(
        lectureData.subjectName || lectureData.subject || "",
      ).trim();
      subjectId = String(
        lectureData.subjectId || makeSubjectId(subjectName),
      ).trim();
      resolvedBranch = normalizeBranch(
        lectureData.branch || lectureData.dept || "",
      );
      resolvedYear = normalizeYear(lectureData.year || "");
      resolvedSemester = normalizeSemester(lectureData.semester || "");
      lectureDay = String(lectureData.day || "").trim();
      lectureStartTime = String(lectureData.startTime || "").trim();
      lectureEndTime = String(lectureData.endTime || "").trim();

      if (!subjectName || !subjectId || !resolvedBranch || !resolvedYear) {
        return NextResponse.json(
          { message: "Selected lecture has incomplete subject/class metadata." },
          { status: 400 },
        );
      }
    }

    if (!lectureIdInput) {
      const assignments: Record<string, any>[] = Array.isArray(
        teacherData.assignments,
      )
        ? teacherData.assignments
        : [];
      if (assignments.length === 0) {
        return NextResponse.json(
          { message: "Teacher has no active subject assignments." },
          { status: 403 },
        );
      }

      const matchingAssignments = assignments.filter((assignment) => {
        const assignmentBranch = normalizeBranch(
          assignment.branch || assignment.dept || "",
        );
        const assignmentYear = normalizeYear(assignment.year || "");
        const assignmentSubjects = normalizeSubjectValues(assignment.subjects);

        const branchOk = !branchInput || assignmentBranch === branchInput;
        const yearOk = !yearInput || assignmentYear === yearInput;

        const subjectOk = assignmentSubjects.some((subject) =>
          subjectMatches(subjectNameInput, subjectIdInput, subject),
        );

        return branchOk && yearOk && subjectOk;
      });

      if (matchingAssignments.length === 0) {
        return NextResponse.json(
          {
            message:
              "Teacher is not assigned to this subject/class combination.",
          },
          { status: 403 },
        );
      }

      if (matchingAssignments.length > 1 && (!branchInput || !yearInput)) {
        return NextResponse.json(
          {
            message:
              "Multiple class assignments found for this subject. Include branch and year.",
          },
          { status: 400 },
        );
      }

      const assignment = matchingAssignments[0];
      resolvedBranch = normalizeBranch(
        assignment.branch || assignment.dept || "",
      );
      resolvedYear = normalizeYear(assignment.year || "");
      resolvedSemester =
        semesterInput || normalizeSemester(assignment.semester || "");

      const assignmentSubjects = normalizeSubjectValues(assignment.subjects);
      const matchedSubject =
        assignmentSubjects.find((subject) =>
          subjectMatches(subjectNameInput, subjectIdInput, subject),
        ) || subjectNameInput;

      subjectName = String(matchedSubject || "").trim();
      subjectId = subjectIdInput || makeSubjectId(subjectName);
      if (!subjectName || !subjectId) {
        return NextResponse.json(
          { message: "subjectName/subjectId is required." },
          { status: 400 },
        );
      }
    }

    const sameDateSessionsSnapshot = await firestore
      .collection("attendance_sessions")
      .where("teacherId", "==", g.uid)
      .where("date", "==", date)
      .get();

    const sameDateSessions: Record<string, any>[] =
      sameDateSessionsSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

    const matchingSession = sameDateSessions.find((session) => {
      const sameLectureId =
        lectureIdInput &&
        String(session.lectureId || "").trim() === lectureIdInput;

      if (sameLectureId) {
        return true;
      }

      if (lectureIdInput && String(session.lectureId || "").trim()) {
        return false;
      }

      const sameSubject = String(session.subjectId || "").trim() === subjectId;
      if (!sameSubject) {
        return false;
      }

      const sameDay = lectureDay
        ? String(session.day || "")
            .trim()
            .toLowerCase() === lectureDay.toLowerCase()
        : true;
      const sameStart = lectureStartTime
        ? String(session.lectureStartTime || "").trim() === lectureStartTime
        : true;
      const sameEnd = lectureEndTime
        ? String(session.lectureEndTime || "").trim() === lectureEndTime
        : true;

      return sameDay && sameStart && sameEnd;
    });

    if (matchingSession) {
      const normalizedStatus = String(matchingSession.status || "")
        .trim()
        .toLowerCase();

      if (normalizedStatus === "active") {
        return NextResponse.json(
          {
            success: true,
            message: "Active attendance session already exists.",
            sessionId: matchingSession.id,
            session: matchingSession,
          },
          { status: 200 },
        );
      }

      return NextResponse.json(
        {
          message:
            "Attendance for this lecture and date is already taken. Open Past Attendance Sessions to view/export it.",
          existingSession: matchingSession,
        },
        { status: 409 },
      );
    }

    const sessionRef = firestore.collection("attendance_sessions").doc();
    const nowMs = Date.now();

    const payload = {
      sessionId: sessionRef.id,
      teacherId: g.uid,
      teacherName:
        teacherData.fullName || teacherData.name || g.token.name || "Teacher",
      subjectId,
      subjectName,
      date,
      branch: resolvedBranch,
      year: resolvedYear,
      semester: resolvedSemester || "",
      lectureId: lectureIdInput || "",
      day: lectureDay || "",
      lectureStartTime,
      lectureEndTime,
      status: "active",
      startTime: FieldValue.serverTimestamp(),
      startTimeMs: nowMs,
      allowedDistanceMeters: ATTENDANCE_ALLOWED_DISTANCE_METERS,
      attendanceWindowSeconds,
      enforceDistanceCheck,
      teacherLocation,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const enrolledStudents = await getSessionEnrolledStudents(
      firestore,
      payload,
    );
    const enrolledStudentIds = enrolledStudents
      .map((student) => String(student.uid || "").trim())
      .filter(Boolean);

    await sessionRef.set({
      ...payload,
      enrolledStudentsCount: enrolledStudentIds.length,
      enrolledStudentIds,
    });

    getAttendanceSessionJoinMap(sessionRef.id);

    const responseSession = {
      ...payload,
      startTime: new Date(nowMs).toISOString(),
      enrolledStudentsCount: enrolledStudentIds.length,
      enrolledStudentIds,
    };

    // The global broadcast reaches EVERY connected socket, so it must carry no
    // roster or personal data — it is only a "something changed, refetch" nudge,
    // and clients already refresh through the guarded API. The full payload goes
    // to the session room, whose membership is authorized in socket-auth.ts.
    getIO()?.emit("attendance-session-started", { sessionId: sessionRef.id });
    getIO()
      ?.to(`attendance_${sessionRef.id}`)
      .emit("attendance-session-started", responseSession);

    return NextResponse.json(
      {
        success: true,
        message: "Attendance session started successfully.",
        sessionId: sessionRef.id,
        session: responseSession,
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
