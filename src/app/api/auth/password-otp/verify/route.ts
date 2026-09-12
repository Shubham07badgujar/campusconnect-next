import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import {
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_OTP_COLLECTION,
  PASSWORD_RESET_RESET_TOKEN_TTL_MS,
} from "@/lib/server/constants";
import {
  buildPasswordOtpHash,
  buildPasswordResetDocId,
  buildPasswordResetTokenHash,
  maskEmailAddress,
  resolveLoginIdentityForPasswordReset,
} from "@/lib/server/otp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const loginId = String(body.loginId || "").trim();
  const otp = String(body.otp || "")
    .trim()
    .replace(/\s+/g, "");

  if (!loginId || !/^\d{6}$/.test(otp)) {
    return NextResponse.json(
      { message: "Valid login ID and 6-digit OTP are required." },
      { status: 400 },
    );
  }

  try {
    const identity = await resolveLoginIdentityForPasswordReset(loginId);
    if (!identity || !identity.authEmail) {
      return NextResponse.json(
        { message: "Invalid login ID or OTP." },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();
    const docId = buildPasswordResetDocId(identity.authEmail);
    const otpDocRef = firestore
      .collection(PASSWORD_RESET_OTP_COLLECTION)
      .doc(docId);
    const otpDoc = await otpDocRef.get();

    if (!otpDoc.exists) {
      return NextResponse.json(
        { message: "OTP not found. Request again." },
        { status: 400 },
      );
    }

    const otpData = (otpDoc.data() || {}) as any;
    const now = Date.now();

    if (Number(otpData.otpExpiresAt || 0) < now) {
      await otpDocRef.delete();
      return NextResponse.json(
        { message: "OTP expired. Request again." },
        { status: 400 },
      );
    }

    const attempts = Number(otpData.attempts || 0);
    if (attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      await otpDocRef.delete();
      return NextResponse.json(
        {
          message: "Too many incorrect OTP attempts. Request a new OTP.",
        },
        { status: 429 },
      );
    }

    const expectedHash = buildPasswordOtpHash(identity.authEmail, otp);
    if (expectedHash !== otpData.otpHash) {
      const nextAttempts = attempts + 1;

      if (nextAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
        await otpDocRef.delete();
      } else {
        await otpDocRef.set(
          {
            attempts: nextAttempts,
            lastAttemptAt: now,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
      }

      return NextResponse.json({ message: "Invalid OTP." }, { status: 400 });
    }

    const resetToken = crypto.randomBytes(24).toString("hex");
    await otpDocRef.set(
      {
        otpHash: "",
        attempts: 0,
        verifiedAt: now,
        resetTokenHash: buildPasswordResetTokenHash(
          identity.authEmail,
          resetToken,
        ),
        resetTokenExpiresAt: now + PASSWORD_RESET_RESET_TOKEN_TTL_MS,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return NextResponse.json(
      {
        success: true,
        message: "OTP verified successfully.",
        resetToken,
        loginId,
        maskedEmail: maskEmailAddress(identity.personalEmail),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Password OTP verify error:", error);
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}
