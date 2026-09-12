import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAuthenticatedUser } from "@/lib/server/auth-guards";
import { getStudentProfileByUid } from "@/lib/server/utils";
import {
  makeSubjectId,
  normalizeSubjectValues,
} from "@/lib/server/attendance/shared";
import { buildSubjectAttendanceIndex } from "@/lib/server/attendance/ops-helpers";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const g = await requireAuthenticatedUser(req);
  if (g.ok === false) return g.response;

  try {
    const decodedToken = g.token;
    const { studentId: studentIdParam } = await params;
    const studentId = String(studentIdParam || "").trim();
    if (!studentId) {
      return NextResponse.json(
        { message: "studentId is required." },
        { status: 400 },
      );
    }

    if (
      !decodedToken.admin &&
      !decodedToken.teacher &&
      decodedToken.uid !== studentId
    ) {
      return NextResponse.json(
        { message: "Unauthorized access." },
        { status: 403 },
      );
    }

    const firestore = adminApp.firestore();
    const studentProfile = await getStudentProfileByUid(firestore, studentId);
    const subjectNameById = new Map<string, string>();

    normalizeSubjectValues(
      (studentProfile as Record<string, any>)?.subjects,
    ).forEach((subjectName) => {
      const id = makeSubjectId(subjectName);
      if (!id || subjectNameById.has(id)) {
        return;
      }
      subjectNameById.set(id, subjectName);
    });

    const existingSnapshot = await firestore
      .collection("student_attendance")
      .where("studentId", "==", studentId)
      .get();

    existingSnapshot.docs.forEach((docSnap) => {
      const data: Record<string, any> = docSnap.data() || {};
      const subjectId = String(data.subjectId || "").trim();
      if (!subjectId) {
        return;
      }

      if (!subjectNameById.has(subjectId)) {
        const subjectName = String(data.subjectName || "").trim();
        subjectNameById.set(subjectId, subjectName || subjectId);
      }
    });

    const records = [];
    for (const [subjectId, subjectName] of subjectNameById.entries()) {
      const { attendanceByStudentId } = await buildSubjectAttendanceIndex(
        firestore,
        subjectId,
      );
      const attendance = attendanceByStudentId.get(studentId) || {
        totalClasses: 0,
        attendedClasses: 0,
      };
      const totalClasses = Number(attendance.totalClasses || 0);
      const attendedClasses = Number(attendance.attendedClasses || 0);
      const percentage = totalClasses
        ? Number(((attendedClasses / totalClasses) * 100).toFixed(2))
        : 0;

      records.push({
        id: `${studentId}_${subjectId}`,
        studentId,
        subjectId,
        subjectName: subjectName || subjectId,
        totalClasses,
        attendedClasses,
        percentage,
      });
    }

    return NextResponse.json(
      { success: true, attendance: records },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}
