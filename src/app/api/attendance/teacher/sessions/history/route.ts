import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireTeacher } from "@/lib/server/auth-guards";
import { toMillis } from "@/lib/server/utils";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const g = await requireTeacher(req);
  if (g.ok === false) return g.response;

  try {
    const { searchParams } = new URL(req.url);
    const limitRaw = Number(searchParams.get("limit"));
    const historyLimit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(100, Math.floor(limitRaw)))
      : 30;

    const firestore = adminApp.firestore();
    const sessionsSnapshot = await firestore
      .collection("attendance_sessions")
      .where("teacherId", "==", g.uid)
      .where("status", "==", "ended")
      .get();

    const sessions: Record<string, any>[] = sessionsSnapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort(
        (a: Record<string, any>, b: Record<string, any>) =>
          Number(b.endTimeMs || b.startTimeMs || 0) -
          Number(a.endTimeMs || a.startTimeMs || 0),
      )
      .slice(0, historyLimit);

    const sessionsWithDetails = await Promise.all(
      sessions.map(async (session) => {
        const sessionId = String(session.sessionId || session.id || "").trim();
        const recordsSnapshot = await firestore
          .collection("attendance_records")
          .where("sessionId", "==", sessionId)
          .get();

        const records: Record<string, any>[] = recordsSnapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .sort(
            (a: Record<string, any>, b: Record<string, any>) =>
              toMillis(b.timestamp) - toMillis(a.timestamp),
          );

        const presentStudentIds = new Set(
          records
            .map((record) => String(record.studentId || "").trim())
            .filter(Boolean),
        );
        const enrolledStudentIds: string[] = Array.isArray(
          session.enrolledStudentIds,
        )
          ? session.enrolledStudentIds
              .map((id: unknown) => String(id || "").trim())
              .filter(Boolean)
          : [];
        const absentStudentIds = enrolledStudentIds.filter(
          (id) => !presentStudentIds.has(id),
        );

        const presentStudents = Array.isArray(session.presentStudents)
          ? session.presentStudents
          : records.map((record) => ({
              studentId: String(record.studentId || "").trim(),
              studentName: record.studentName || "Student",
              prn: record.prn || "",
            }));

        const absentStudents = Array.isArray(session.absentStudents)
          ? session.absentStudents
          : absentStudentIds.map((studentId) => ({
              studentId,
              studentName: "",
              prn: "",
            }));

        return {
          ...session,
          sessionId,
          records,
          presentCount: Number(session.presentCount || records.length || 0),
          enrolledStudentsCount: Number(
            session.enrolledStudentsCount || enrolledStudentIds.length || 0,
          ),
          absentCount: absentStudentIds.length,
          absentStudentIds,
          presentStudents,
          absentStudents,
        };
      }),
    );

    return NextResponse.json(
      {
        success: true,
        sessions: sessionsWithDetails,
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
