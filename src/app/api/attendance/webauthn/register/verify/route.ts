import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import { requireStudent } from "@/lib/server/auth-guards";
import {
  consumeWebauthnChallenge,
  getExpectedOrigins,
  getWebauthnRpIdCandidates,
} from "@/lib/server/attendance/webauthn";
import { WEBAUTHN_CREDENTIALS_COLLECTION } from "@/lib/server/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireStudent(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json();
    const studentId = g.uid;
    const challengeId = String(body.challengeId || "").trim();
    const credential = body.credential;

    if (!challengeId || !credential || typeof credential !== "object") {
      return NextResponse.json(
        { message: "challengeId and credential are required." },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();

    let expectedChallenge: string;
    try {
      expectedChallenge = await consumeWebauthnChallenge(firestore, {
        challengeId,
        studentId,
        type: "registration",
      });
    } catch (challengeError) {
      return NextResponse.json(
        { message: (challengeError as Error).message },
        { status: 403 },
      );
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin: getExpectedOrigins(req),
        expectedRPID: getWebauthnRpIdCandidates(req),
        requireUserVerification: true,
      });
    } catch (verificationError) {
      return NextResponse.json(
        {
          message: `Passkey registration failed: ${(verificationError as Error).message}`,
        },
        { status: 403 },
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { message: "Passkey registration could not be verified." },
        { status: 403 },
      );
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
    const storedCredential = {
      credentialId: Buffer.from(credentialID).toString("base64url"),
      publicKey: Buffer.from(credentialPublicKey).toString("base64url"),
      counter: Number(counter) || 0,
      transports: Array.isArray(credential?.response?.transports)
        ? credential.response.transports
        : [],
      registeredAtMs: Date.now(),
    };

    const passkeyRef = firestore
      .collection(WEBAUTHN_CREDENTIALS_COLLECTION)
      .doc(studentId);
    const passkeyDoc = await passkeyRef.get();
    const credentials = (
      passkeyDoc.exists
        ? ((passkeyDoc.data() as Record<string, any>)?.credentials || [])
        : []
    ).filter(
      (item: Record<string, any>) =>
        item?.credentialId !== storedCredential.credentialId,
    );
    credentials.push(storedCredential);

    await passkeyRef.set(
      {
        studentId,
        credentials,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json(
      {
        success: true,
        credentialId: storedCredential.credentialId,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
