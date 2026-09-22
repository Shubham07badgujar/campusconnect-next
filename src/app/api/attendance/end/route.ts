import { NextRequest, NextResponse } from "next/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import { requireTeacher } from "@/lib/server/auth-guards";
import { getPrnFromRecord, getStudentProfileByUid } from "@/lib/server/utils";
import { getSessionEnrolledStudents } from "@/lib/server/attendance/shared";
import {
  clearAttendanceSessionJoinMap,
  getIO,
} from "@/lib/server/socket-io";
import { reportError } from "@/lib/server/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireTeacher(req);
  if (g.ok === false) return g.response;

  try {
    const body: Record<string, any> = await req.json().catch(() => ({}));
    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId) {
      return NextResponse.json(
        { message: "sessionId is required." },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();
    const sessionRef = firestore
      .collection("attendance_sessions")
      .doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return NextResponse.json(
        { message: "Attendance session not found." },
        { status: 404 },
      );
    }

    const sessionData: Record<string, any> = sessionDoc.data() || {};
    if (String(sessionData.teacherId || "") !== g.uid) {
      return NextResponse.json(
        { message: "Only session owner can end session." },
        { status: 403 },
      );
    }

    if (sessionData.status === "ended") {
      return NextResponse.json(
        { success: true, message: "Session is already ended." },
        { status: 200 },
      );
    }

    const recordsSnapshot = await firestore
      .collection("attendance_records")
      .where("sessionId", "==", sessionId)
      .get();

    const attendanceRecords: Record<string, any>[] = recordsSnapshot.docs.map(
      (docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }),
    );

    const presentStudentIds = new Set(
      attendanceRecords
        .map((record) => String(record.studentId || "").trim())
        .filter(Boolean),
    );

    let enrolledStudentIds: string[] = Array.isArray(
      sessionData.enrolledStudentIds,
    )
      ? sessionData.enrolledStudentIds
          .map((id: unknown) => String(id || "").trim())
          .filter(Boolean)
      : [];

    if (enrolledStudentIds.length === 0) {
      const enrolledStudents = await getSessionEnrolledStudents(
        firestore,
        sessionData,
      );
      enrolledStudentIds = enrolledStudents
        .map((student) => String(student.uid || "").trim())
        .filter(Boolean);
    }

    const nowMs = Date.now();
    const enrolledStudentsCount = enrolledStudentIds.length;
    const presentCount = presentStudentIds.size;
    const absentStudentIds = enrolledStudentIds.filter(
      (studentId) => !presentStudentIds.has(studentId),
    );

    const studentProfilePairs = await Promise.all(
      enrolledStudentIds.map(
        async (studentId): Promise<[string, Record<string, any> | null]> => {
          const profile = await getStudentProfileByUid(firestore, studentId);
          return [studentId, profile];
        },
      ),
    );
    const studentProfilesById = new Map(studentProfilePairs);

    const attendanceByStudentId = new Map<string, Record<string, any>>();
    attendanceRecords.forEach((record) => {
      const studentId = String(record.studentId || "").trim();
      if (!studentId || attendanceByStudentId.has(studentId)) {
        return;
      }
      attendanceByStudentId.set(studentId, record);
    });

    const toStudentSummary = (studentId: string) => {
      const profile: Record<string, any> =
        studentProfilesById.get(studentId) || {};
      const record: Record<string, any> =
        attendanceByStudentId.get(studentId) || {};
      return {
        studentId,
        studentName:
          record.studentName ||
          profile.name ||
          profile.displayName ||
          "Student",
        prn: record.prn || getPrnFromRecord(profile) || "",
      };
    };

    const presentStudents = Array.from(presentStudentIds).map(toStudentSummary);
    const absentStudents = absentStudentIds.map(toStudentSummary);

    const currentRate = enrolledStudentsCount
      ? Number(((presentCount / enrolledStudentsCount) * 100).toFixed(2))
      : 0;

    await sessionRef.set(
      {
        status: "ended",
        endTime: FieldValue.serverTimestamp(),
        endTimeMs: nowMs,
        presentCount,
        enrolledStudentsCount,
        enrolledStudentIds,
        absentStudentIds,
        presentStudents,
        absentStudents,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const sessionEndedPayload = {
      sessionId,
      status: "ended",
      presentCount,
      enrolledStudentsCount,
      absentCount: absentStudentIds.length,
      presentStudentIds: Array.from(presentStudentIds),
      absentStudentIds,
      presentStudents,
      absentStudents,
      endTime: new Date(nowMs).toISOString(),
    };

    // The global broadcast reaches EVERY connected socket, so it must not carry
    // the present/absent rosters — that would disclose exactly who was absent,
    // by name and PRN, to every signed-in user. Students only read `sessionId`
    // from this event; the owning teacher receives the full summary through the
    // session room below, whose membership is authorized in socket-auth.ts.
    getIO()?.emit("attendance-session-ended", { sessionId, status: "ended" });
    getIO()
      ?.to(`attendance_${sessionId}`)
      .emit("attendance-session-ended", sessionEndedPayload);

    clearAttendanceSessionJoinMap(sessionId);

    void (async () => {
      for (const studentId of enrolledStudentIds) {
        if (!studentId) continue;

        const docId = `${studentId}_${sessionData.subjectId}`;
        const attendanceRef = firestore
          .collection("student_attendance")
          .doc(docId);

        await attendanceRef.set(
          {
            studentId,
            subjectId: sessionData.subjectId,
            subjectName: sessionData.subjectName || "",
            totalClasses: FieldValue.increment(1),
            attendedClasses: FieldValue.increment(
              presentStudentIds.has(studentId) ? 1 : 0,
            ),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      const statsDocId = `${sessionData.subjectId}_${sessionData.teacherId}`;
      const statsRef = firestore
        .collection("subject_attendance_stats")
        .doc(statsDocId);

      await statsRef.set(
        {
          subjectId: sessionData.subjectId,
          subjectName: sessionData.subjectName || "",
          teacherId: sessionData.teacherId,
          totalClasses: FieldValue.increment(1),
          cumulativeAttendanceRate: FieldValue.increment(currentRate),
          lastAttendanceRate: currentRate,
          lastUpdated: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    })().catch((error) => {
      reportError("Deferred attendance rollup failed", error, {
        route: "/api/attendance/end",
      });
    });

    return NextResponse.json(
      {
        success: true,
        message: "Attendance session ended successfully.",
        session: {
          ...sessionEndedPayload,
          subjectId: sessionData.subjectId || "",
          subjectName: sessionData.subjectName || "",
          date: sessionData.date || "",
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}
