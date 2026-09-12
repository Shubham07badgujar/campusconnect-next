import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireStudent } from "@/lib/server/auth-guards";
import {
  createWebauthnChallenge,
  getStoredPasskeys,
  resolveWebauthnRpId,
} from "@/lib/server/attendance/webauthn";
import { WEBAUTHN_RP_NAME } from "@/lib/server/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireStudent(req);
  if (g.ok === false) return g.response;

  try {
    const studentId = g.uid;
    const studentData = g.studentData as Record<string, any>;
    const firestore = adminApp.firestore();

    const existingCredentials = await getStoredPasskeys(firestore, studentId);

    const options = await generateRegistrationOptions({
      rpName: WEBAUTHN_RP_NAME,
      rpID: resolveWebauthnRpId(req),
      userID: studentId,
      userName:
        String(studentData.email || studentData.loginId || "").trim() || studentId,
      userDisplayName:
        String(studentData.name || studentData.displayName || "").trim() || "Student",
      attestationType: "none",
      excludeCredentials: existingCredentials.map((cred) => ({
        id: Buffer.from(cred.credentialId, "base64url"),
        type: "public-key" as const,
        transports:
          Array.isArray(cred.transports) && cred.transports.length
            ? (cred.transports as any)
            : undefined,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });

    const challengeId = await createWebauthnChallenge(firestore, {
      studentId,
      type: "registration",
      challenge: options.challenge,
    });

    return NextResponse.json({ success: true, challengeId, options });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
