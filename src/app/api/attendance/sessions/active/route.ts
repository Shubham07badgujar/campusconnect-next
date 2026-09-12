import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAuthenticatedUser } from "@/lib/server/auth-guards";
import { getStudentProfileByUid } from "@/lib/server/utils";
import { studentBelongsToSession } from "@/lib/server/attendance/shared";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const g = await requireAuthenticatedUser(req);
  if (g.ok === false) return g.response;

  try {
    const decodedToken = g.token;
    const firestore = adminApp.firestore();

    const snapshot = await firestore
      .collection("attendance_sessions")
      .where("status", "==", "active")
      .get();

    let sessions: Record<string, any>[] = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    if (!decodedToken.teacher && !decodedToken.admin) {
      const studentData = await getStudentProfileByUid(
        firestore,
        decodedToken.uid,
      );
      if (!studentData) {
        return NextResponse.json(
          { success: true, sessions: [] },
          { status: 200 },
        );
      }

      sessions = sessions.filter((session) =>
        studentBelongsToSession(studentData, session),
      );
    }

    sessions.sort(
      (a, b) => Number(b.startTimeMs || 0) - Number(a.startTimeMs || 0),
    );

    return NextResponse.json({ success: true, sessions }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}
