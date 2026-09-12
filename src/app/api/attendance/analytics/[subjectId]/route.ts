import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireTeacher } from "@/lib/server/auth-guards";
import { getPrnFromRecord, getStudentProfileByUid, toMillis } from "@/lib/server/utils";
import {
  getSessionEnrolledStudents,
  makeSubjectId,
  normalizeSubjectValues,
} from "@/lib/server/attendance/shared";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> },
) {
  const g = await requireTeacher(req);
  if (g.ok === false) return g.response;

  try {
    const { subjectId: subjectIdParam } = await params;
    const subjectId = String(subjectIdParam || "").trim();
    if (!subjectId) {
      return NextResponse.json(
        { message: "subjectId is required." },
        { status: 400 },
      );
    }

    const teacherDoc = g.teacherDoc;
    const teacherData: Record<string, any> = teacherDoc.exists
      ? teacherDoc.data() || {}
      : {};
    const assignments: Record<string, any>[] = Array.isArray(
      teacherData.assignments,
    )
      ? teacherData.assignments
      : [];
    const isAssigned = assignments.some((assignment) =>
      normalizeSubjectValues(assignment.subjects).some(
        (subject) => makeSubjectId(subject) === subjectId,
      ),
    );

    if (!isAssigned) {
      return NextResponse.json(
        { message: "Teacher is not assigned to this subject." },
        { status: 403 },
      );
    }

    const firestore = adminApp.firestore();
    const sessionsSnapshot = await firestore
      .collection("attendance_sessions")
      .where("teacherId", "==", g.uid)
      .where("subjectId", "==", subjectId)
      .where("status", "==", "ended")
      .get();

    const sessions: Record<string, any>[] = sessionsSnapshot.docs.map(
      (docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }),
    );

    sessions.sort((a, b) => toMillis(a.startTime) - toMillis(b.startTime));

    const weeklyCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weeklyTrend = [];
    let totalRate = 0;

    for (const session of sessions) {
      let presentCount = Number(session.presentCount || 0);
      let enrolledCount = Number(session.enrolledStudentsCount || 0);

      if (!Number.isFinite(presentCount)) {
        presentCount = 0;
      }
      if (!Number.isFinite(enrolledCount)) {
        enrolledCount = 0;
      }

      if (!enrolledCount) {
        if (Array.isArray(session.enrolledStudentIds)) {
          enrolledCount = session.enrolledStudentIds.length;
        } else {
          const enrolledStudents = await getSessionEnrolledStudents(
            firestore,
            session,
          );
          enrolledCount = enrolledStudents.length;
        }
      }

      if (!presentCount && (session.sessionId || session.id)) {
        const sessionRecords = await firestore
          .collection("attendance_records")
          .where("sessionId", "==", session.sessionId || session.id)
          .get();
        presentCount = sessionRecords.size;
      }

      const attendanceRate = enrolledCount
        ? Number(((presentCount / enrolledCount) * 100).toFixed(2))
        : 0;

      totalRate += attendanceRate;

      const sessionStartMs =
        Number(session.startTimeMs) || toMillis(session.startTime);
      if (sessionStartMs >= weeklyCutoff) {
        weeklyTrend.push({
          date:
            session.date || new Date(sessionStartMs).toISOString().slice(0, 10),
          attendanceRate,
          presentStudents: presentCount,
          totalStudents: enrolledCount,
        });
      }
    }

    const studentAttendanceSnapshot = await firestore
      .collection("student_attendance")
      .where("subjectId", "==", subjectId)
      .get();

    const atRiskBase: Record<string, any>[] = studentAttendanceSnapshot.docs
      .map((docSnap) => {
        const data: Record<string, any> = docSnap.data() || {};
        const totalClasses = Number(data.totalClasses || 0);
        const attendedClasses = Number(data.attendedClasses || 0);
        const percentage = totalClasses
          ? Number(((attendedClasses / totalClasses) * 100).toFixed(2))
          : 0;

        return { id: docSnap.id, ...data, percentage };
      })
      .filter((entry) => Number(entry.percentage || 0) < 75)
      .sort((a, b) => Number(a.percentage || 0) - Number(b.percentage || 0));

    const atRiskStudents = await Promise.all(
      atRiskBase.map(async (entry) => {
        const studentId = String(entry.studentId || "").trim();
        if (!studentId) {
          return {
            ...entry,
            studentName: entry.studentName || "",
            prn: entry.prn || "",
          };
        }

        const profile = await getStudentProfileByUid(firestore, studentId);
        return {
          ...entry,
          studentName:
            entry.studentName ||
            (profile as Record<string, any>)?.name ||
            (profile as Record<string, any>)?.displayName ||
            "",
          prn: entry.prn || getPrnFromRecord(profile || {}) || "",
        };
      }),
    );

    const classAttendanceRate = sessions.length
      ? Number((totalRate / sessions.length).toFixed(2))
      : 0;

    const statsDocId = `${subjectId}_${g.uid}`;
    const statsDoc = await firestore
      .collection("subject_attendance_stats")
      .doc(statsDocId)
      .get();
    const summaryData: Record<string, any> = statsDoc.exists
      ? statsDoc.data() || {}
      : {};
    const summaryTotalClasses = Number(
      summaryData.totalClasses || sessions.length || 0,
    );
    const summaryCumulativeRate = Number(summaryData.cumulativeAttendanceRate);
    const summaryAverageFromCumulative =
      Number.isFinite(summaryCumulativeRate) && summaryTotalClasses > 0
        ? Number((summaryCumulativeRate / summaryTotalClasses).toFixed(2))
        : null;

    const subjectSummary = {
      subjectId,
      ...summaryData,
      totalClasses: summaryTotalClasses,
      averageAttendance:
        summaryAverageFromCumulative ??
        Number(summaryData.averageAttendance || classAttendanceRate || 0),
      lastUpdated: summaryData.lastUpdated || null,
    };

    return NextResponse.json(
      {
        success: true,
        analytics: {
          subjectId,
          totalSessions: sessions.length,
          classAttendanceRate,
          studentsAtRisk: atRiskStudents,
          weeklyTrend,
          summary: subjectSummary,
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
