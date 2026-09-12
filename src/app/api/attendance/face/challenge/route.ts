import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import { requireStudent } from "@/lib/server/auth-guards";
import { studentBelongsToSession } from "@/lib/server/attendance/shared";
import { FACE_CHALLENGE_TTL_MS } from "@/lib/server/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireStudent(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json();
    const studentId = g.uid;
    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId) {
      return NextResponse.json({ message: "sessionId is required." }, { status: 400 });
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

    const sessionData = (sessionDoc.data() || {}) as Record<string, any>;
    if (sessionData.status !== "active") {
      return NextResponse.json(
        { message: "Attendance session has already ended." },
        { status: 400 },
      );
    }

    if (!studentBelongsToSession(g.studentData, sessionData)) {
      return NextResponse.json(
        { message: "Student is not enrolled for this session subject." },
        { status: 403 },
      );
    }

    const challengeRef = firestore.collection("attendance_face_challenges").doc();
    const nowMs = Date.now();
    const expiresAtMs = nowMs + FACE_CHALLENGE_TTL_MS;

    await challengeRef.set({
      challengeId: challengeRef.id,
      sessionId,
      studentId,
      challenge: crypto.randomBytes(24).toString("hex"),
      createdAtMs: nowMs,
      expiresAtMs,
      used: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      {
        success: true,
        challengeId: challengeRef.id,
        expiresAtMs,
        ttlSeconds: Math.floor(FACE_CHALLENGE_TTL_MS / 1000),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
