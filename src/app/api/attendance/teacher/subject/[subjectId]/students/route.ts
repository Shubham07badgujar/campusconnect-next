import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireTeacher } from "@/lib/server/auth-guards";
import {
  normalizeBranch,
  normalizeSemester,
  normalizeYear,
} from "@/lib/server/constants";
import { getPrnFromRecord } from "@/lib/server/utils";
import {
  getSessionEnrolledStudents,
  makeSubjectId,
  normalizeSubjectValues,
} from "@/lib/server/attendance/shared";
import { buildSubjectAttendanceIndex } from "@/lib/server/attendance/ops-helpers";

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

    const relevantAssignments = assignments
      .map((assignment) => {
        const subjects = normalizeSubjectValues(assignment.subjects);
        const matchedSubjects = subjects.filter(
          (subject) => makeSubjectId(subject) === subjectId,
        );

        if (matchedSubjects.length === 0) {
          return null;
        }

        return {
          branch: normalizeBranch(
            assignment.branch || assignment.dept || assignment.department || "",
          ),
          year: normalizeYear(assignment.year || ""),
          semester: normalizeSemester(assignment.semester || ""),
          matchedSubjects,
        };
      })
      .filter(Boolean)
      .filter((assignment) => assignment.branch && assignment.year);

    if (relevantAssignments.length === 0) {
      return NextResponse.json(
        { message: "Teacher is not assigned to this subject." },
        { status: 403 },
      );
    }

    const firestore = adminApp.firestore();
    const rosterMap = new Map<string, Record<string, any>>();

    for (const assignment of relevantAssignments) {
      for (const subjectName of assignment.matchedSubjects) {
        const candidates = await getSessionEnrolledStudents(firestore, {
          branch: assignment.branch,
          year: assignment.year,
          semester: assignment.semester,
          subjectId,
          subjectName,
        });

        candidates.forEach((student) => {
          const studentId = String(student.uid || "").trim();
          if (!studentId || rosterMap.has(studentId)) {
            return;
          }

          rosterMap.set(studentId, {
            studentId,
            studentName: student.name || student.displayName || "Student",
            prn: getPrnFromRecord(student),
            branch:
              student.dept || student.department || assignment.branch || "",
            year: student.year || assignment.year || "",
            semester: student.semester || assignment.semester || "",
          });
        });
      }
    }

    const { attendanceByStudentId } = await buildSubjectAttendanceIndex(
      firestore,
      subjectId,
    );

    const students = Array.from(rosterMap.values())
      .map((student): Record<string, any> => {
        const attendance = attendanceByStudentId.get(student.studentId) || {
          totalClasses: 0,
          attendedClasses: 0,
        };
        const attendancePercentage = attendance.totalClasses
          ? Number(
              (
                (attendance.attendedClasses / attendance.totalClasses) *
                100
              ).toFixed(2),
            )
          : 0;

        return {
          ...student,
          totalClasses: attendance.totalClasses,
          attendedClasses: attendance.attendedClasses,
          attendancePercentage,
        };
      })
      .sort((a, b) =>
        String(a.studentName || "").localeCompare(String(b.studentName || "")),
      );

    const { searchParams } = new URL(req.url);

    return NextResponse.json(
      {
        success: true,
        subject: {
          subjectId,
          subjectName:
            relevantAssignments[0]?.matchedSubjects?.[0] ||
            searchParams.get("subjectName") ||
            subjectId,
        },
        totalStudents: students.length,
        students,
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
