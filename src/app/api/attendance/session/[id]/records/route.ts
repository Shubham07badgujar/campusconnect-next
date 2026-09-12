import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAuthenticatedUser } from "@/lib/server/auth-guards";
import { toMillis } from "@/lib/server/utils";
import { getAttendanceJoinedStudentsList } from "@/lib/server/socket-io";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireAuthenticatedUser(req);
  if (g.ok === false) return g.response;

  try {
    const decodedToken = g.token;
    const { id } = await params;
    const sessionId = String(id || "").trim();
    if (!sessionId) {
      return NextResponse.json(
        { message: "sessionId is required." },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();
    const sessionDoc = await firestore
      .collection("attendance_sessions")
      .doc(sessionId)
      .get();

    if (!sessionDoc.exists) {
      return NextResponse.json(
        { message: "Attendance session not found." },
        { status: 404 },
      );
    }

    const sessionData: Record<string, any> = sessionDoc.data() || {};
    const isTeacherOwner =
      decodedToken.teacher &&
      String(sessionData.teacherId || "") === String(decodedToken.uid || "");
    const isAdmin = Boolean(decodedToken.admin);
    if (!isTeacherOwner && !isAdmin) {
      return NextResponse.json(
        { message: "Unauthorized access." },
        { status: 403 },
      );
    }

    const recordsSnapshot = await firestore
      .collection("attendance_records")
      .where("sessionId", "==", sessionId)
      .get();

    const records = recordsSnapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Record<string, any>),
      }))
      .sort(
        (a: Record<string, any>, b: Record<string, any>) =>
          toMillis(b.timestamp) - toMillis(a.timestamp),
      );

    return NextResponse.json(
      {
        success: true,
        session: {
          id: sessionDoc.id,
          ...sessionData,
          presentStudentIds: Array.isArray(sessionData.presentStudentIds)
            ? sessionData.presentStudentIds
            : [],
          absentStudentIds: Array.isArray(sessionData.absentStudentIds)
            ? sessionData.absentStudentIds
            : [],
          presentStudents: Array.isArray(sessionData.presentStudents)
            ? sessionData.presentStudents
            : [],
          absentStudents: Array.isArray(sessionData.absentStudents)
            ? sessionData.absentStudents
            : [],
          joinedStudents: getAttendanceJoinedStudentsList(sessionId),
        },
        records,
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
