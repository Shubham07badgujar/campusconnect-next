import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import {
  PASSWORD_RESET_OTP_COLLECTION,
  PASSWORD_RESET_OTP_TTL_MS,
  PASSWORD_RESET_REQUEST_COOLDOWN_MS,
} from "@/lib/server/constants";
import { normalizeEmail } from "@/lib/server/utils";
import { sendMail } from "@/lib/server/mailer";
import {
  buildPasswordOtpHash,
  buildPasswordResetDocId,
  maskEmailAddress,
  resolveLoginIdentityForPasswordReset,
} from "@/lib/server/otp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const loginId = String(body.loginId || "").trim();
  if (!loginId) {
    return NextResponse.json(
      { message: "Login ID is required." },
      { status: 400 },
    );
  }

  const genericMessage =
    "If the login ID exists, an OTP has been sent to the registered personal email.";

  try {
    const identity = await resolveLoginIdentityForPasswordReset(loginId);
    if (!identity || !identity.uid || !identity.authEmail) {
      return NextResponse.json(
        { success: true, message: genericMessage },
        { status: 200 },
      );
    }

    const firestore = adminApp.firestore();
    const docId = buildPasswordResetDocId(identity.authEmail);
    const otpDocRef = firestore
      .collection(PASSWORD_RESET_OTP_COLLECTION)
      .doc(docId);
    const otpDoc = await otpDocRef.get();

    const now = Date.now();
    const existingData = (otpDoc.exists ? otpDoc.data() || {} : {}) as any;
    const lastRequestedAt = Number(existingData.requestedAt || 0);
    if (
      lastRequestedAt > 0 &&
      now - lastRequestedAt < PASSWORD_RESET_REQUEST_COOLDOWN_MS
    ) {
      const waitSeconds = Math.ceil(
        (PASSWORD_RESET_REQUEST_COOLDOWN_MS - (now - lastRequestedAt)) / 1000,
      );
      return NextResponse.json(
        {
          message: `Please wait ${waitSeconds}s before requesting a new OTP.`,
        },
        { status: 429 },
      );
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const otpHash = buildPasswordOtpHash(identity.authEmail, otp);
    const otpExpiresAt = now + PASSWORD_RESET_OTP_TTL_MS;

    await otpDocRef.set(
      {
        uid: identity.uid,
        role: identity.role,
        authEmail: identity.authEmail,
        personalEmail: identity.personalEmail,
        otpHash,
        otpExpiresAt,
        requestedAt: now,
        attempts: 0,
        resetTokenHash: "",
        resetTokenExpiresAt: 0,
        verifiedAt: 0,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    const recipientEmail =
      normalizeEmail(identity.personalEmail) ||
      normalizeEmail(identity.authEmail);

    if (!recipientEmail) {
      return NextResponse.json(
        { success: true, message: genericMessage },
        { status: 200 },
      );
    }

    await sendMail({
      to: recipientEmail,
      subject: "CampusConnect Password Reset OTP",
      text: `Hi ${identity.displayName || "there"},\n\nYour OTP for CampusConnect password reset is: ${otp}\n\nThis OTP is valid for 10 minutes.\nIf you did not request this, please ignore this message.\n\n- CampusConnect Team`,
    });

    return NextResponse.json(
      {
        success: true,
        message: "OTP sent to your registered personal email.",
        loginId,
        maskedEmail: maskEmailAddress(recipientEmail),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Password OTP request error:", error);
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}
