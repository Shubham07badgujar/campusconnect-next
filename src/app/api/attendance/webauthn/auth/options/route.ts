import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireStudent } from "@/lib/server/auth-guards";
import {
  createWebauthnChallenge,
  getStoredPasskeys,
  resolveWebauthnRpId,
} from "@/lib/server/attendance/webauthn";
import { WEBAUTHN_CHALLENGE_TTL_MS } from "@/lib/server/constants";

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
    if (((sessionDoc.data() || {}) as Record<string, any>).status !== "active") {
      return NextResponse.json(
        { message: "Attendance session has already ended." },
        { status: 400 },
      );
    }

    const credentials = await getStoredPasskeys(firestore, studentId);
    if (!credentials.length) {
      return NextResponse.json(
        {
          message: "No passkey registered for this student.",
          code: "NO_PASSKEY",
        },
        { status: 404 },
      );
    }

    const options = await generateAuthenticationOptions({
      rpID: resolveWebauthnRpId(req),
      userVerification: "required",
      allowCredentials: credentials.map((cred) => ({
        id: Buffer.from(cred.credentialId, "base64url"),
        type: "public-key" as const,
        transports:
          Array.isArray(cred.transports) && cred.transports.length
            ? (cred.transports as any)
            : undefined,
      })),
    });

    const challengeId = await createWebauthnChallenge(firestore, {
      studentId,
      type: "authentication",
      sessionId,
      challenge: options.challenge,
    });

    return NextResponse.json({
      success: true,
      challengeId,
      options,
      ttlSeconds: Math.floor(WEBAUTHN_CHALLENGE_TTL_MS / 1000),
    });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
