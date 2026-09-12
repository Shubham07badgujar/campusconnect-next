import { NextRequest, NextResponse } from "next/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import {
  requireAuthenticatedUser,
  requireTeacher,
} from "@/lib/server/auth-guards";
import { getStudentProfileByUid } from "@/lib/server/utils";
import { studentBelongsToSession } from "@/lib/server/attendance/shared";
import { clearAttendanceSessionJoinMap } from "@/lib/server/socket-io";

export const runtime = "nodejs";

// GET /attendance/session/:subjectId — the dynamic segment is a SUBJECT id.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireAuthenticatedUser(req);
  if (g.ok === false) return g.response;

  try {
    const decodedToken = g.token;
    const { id } = await params;
    const subjectId = String(id || "").trim();
    if (!subjectId) {
      return NextResponse.json(
        { message: "subjectId is required." },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();
    const activeSessionsSnapshot = await firestore
      .collection("attendance_sessions")
      .where("subjectId", "==", subjectId)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (activeSessionsSnapshot.empty) {
      return NextResponse.json(
        { success: true, session: null },
        { status: 200 },
      );
    }

    const sessionDoc = activeSessionsSnapshot.docs[0];
    const sessionData: Record<string, any> = sessionDoc.data() || {};
    const session = { id: sessionDoc.id, ...sessionData };

    if (!decodedToken.teacher) {
      const studentData = await getStudentProfileByUid(
        firestore,
        decodedToken.uid,
      );
      if (!studentData || !studentBelongsToSession(studentData, session)) {
        return NextResponse.json(
          { success: true, session: null },
          { status: 200 },
        );
      }
    }

    return NextResponse.json({ success: true, session }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}

// DELETE /attendance/session/:sessionId — the dynamic segment is a SESSION id.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireTeacher(req);
  if (g.ok === false) return g.response;

  try {
    const { id } = await params;
    const sessionId = String(id || "").trim();
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
        { message: "Only session owner can delete this session." },
        { status: 403 },
      );
    }

    if (String(sessionData.status || "").toLowerCase() !== "ended") {
      return NextResponse.json(
        {
          message:
            "Only ended attendance sessions can be deleted from history.",
        },
        { status: 400 },
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
      (Array.isArray(sessionData.presentStudentIds)
        ? sessionData.presentStudentIds
        : attendanceRecords.map((record) => record.studentId)
      )
        .map((studentId: unknown) => String(studentId || "").trim())
        .filter(Boolean),
    );

    const enrolledStudentIds = Array.from(
      new Set(
        [
          ...(Array.isArray(sessionData.enrolledStudentIds)
            ? sessionData.enrolledStudentIds
            : []),
          ...(Array.isArray(sessionData.presentStudentIds)
            ? sessionData.presentStudentIds
            : []),
          ...(Array.isArray(sessionData.absentStudentIds)
            ? sessionData.absentStudentIds
            : []),
          ...(Array.isArray(sessionData.presentStudents)
            ? sessionData.presentStudents.map(
                (student: Record<string, any>) => student.studentId,
              )
            : []),
          ...(Array.isArray(sessionData.absentStudents)
            ? sessionData.absentStudents.map(
                (student: Record<string, any>) => student.studentId,
              )
            : []),
          ...attendanceRecords.map((record) => record.studentId),
        ]
          .map((studentId) => String(studentId || "").trim())
          .filter(Boolean),
      ),
    );

    if (sessionData.subjectId) {
      for (const studentId of enrolledStudentIds) {
        const attendanceRef = firestore
          .collection("student_attendance")
          .doc(`${studentId}_${sessionData.subjectId}`);

        await firestore.runTransaction(async (transaction) => {
          const attendanceDoc = await transaction.get(attendanceRef);
          if (!attendanceDoc.exists) {
            return;
          }

          const attendanceData: Record<string, any> =
            attendanceDoc.data() || {};
          const currentTotal = Number(attendanceData.totalClasses || 0);
          const currentAttended = Number(attendanceData.attendedClasses || 0);
          const nextTotal = Math.max(currentTotal - 1, 0);
          const nextAttended = Math.max(
            currentAttended - (presentStudentIds.has(studentId) ? 1 : 0),
            0,
          );

          transaction.set(
            attendanceRef,
            {
              totalClasses: nextTotal,
              attendedClasses: nextAttended,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        });
      }

      const statsDocId = `${sessionData.subjectId}_${sessionData.teacherId}`;
      const statsRef = firestore
        .collection("subject_attendance_stats")
        .doc(statsDocId);
      const enrolledCount = Number(
        sessionData.enrolledStudentsCount || enrolledStudentIds.length || 0,
      );
      const presentCount = Number(sessionData.presentCount || 0);
      const rateDelta = enrolledCount
        ? Number(((presentCount / enrolledCount) * 100).toFixed(2))
        : 0;

      await firestore.runTransaction(async (transaction) => {
        const statsDoc = await transaction.get(statsRef);
        if (!statsDoc.exists) {
          return;
        }

        const statsData: Record<string, any> = statsDoc.data() || {};
        const nextTotalClasses = Math.max(
          Number(statsData.totalClasses || 0) - 1,
          0,
        );
        const nextCumulativeRate = Math.max(
          Number(statsData.cumulativeAttendanceRate || 0) - rateDelta,
          0,
        );

        transaction.set(
          statsRef,
          {
            totalClasses: nextTotalClasses,
            cumulativeAttendanceRate: Number(nextCumulativeRate.toFixed(2)),
            lastUpdated: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
    }

    const recordRefs = recordsSnapshot.docs.map((docSnap) => docSnap.ref);
    const batchSize = 400;

    for (let index = 0; index < recordRefs.length; index += batchSize) {
      const batch = firestore.batch();
      recordRefs.slice(index, index + batchSize).forEach((recordRef) => {
        batch.delete(recordRef);
      });
      await batch.commit();
    }

    await sessionRef.delete();
    clearAttendanceSessionJoinMap(sessionId);

    return NextResponse.json(
      {
        success: true,
        message: "Attendance session deleted successfully.",
        deletedSessionId: sessionId,
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
