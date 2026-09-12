import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { PASSWORD_RESET_OTP_COLLECTION } from "@/lib/server/constants";
import { normalizeEmail } from "@/lib/server/utils";
import { sendMail } from "@/lib/server/mailer";
import {
  buildPasswordResetDocId,
  buildPasswordResetTokenHash,
  resolveLoginIdentityForPasswordReset,
} from "@/lib/server/otp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const loginId = String(body.loginId || "").trim();
  const resetToken = String(body.resetToken || "").trim();
  const newPassword = String(body.newPassword || "");

  if (!loginId || !resetToken || !newPassword) {
    return NextResponse.json(
      {
        message: "Login ID, reset token, and new password are required.",
      },
      { status: 400 },
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { message: "Password must be at least 8 characters long." },
      { status: 400 },
    );
  }

  try {
    const identity = await resolveLoginIdentityForPasswordReset(loginId);
    if (!identity || !identity.uid || !identity.authEmail) {
      return NextResponse.json(
        { message: "Invalid reset request." },
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
        { message: "Reset session expired." },
        { status: 400 },
      );
    }

    const otpData = (otpDoc.data() || {}) as any;
    const now = Date.now();
    const expectedResetHash = buildPasswordResetTokenHash(
      identity.authEmail,
      resetToken,
    );

    if (
      !otpData.resetTokenHash ||
      expectedResetHash !== otpData.resetTokenHash ||
      Number(otpData.resetTokenExpiresAt || 0) < now
    ) {
      return NextResponse.json(
        { message: "Invalid or expired password reset session." },
        { status: 400 },
      );
    }

    await adminApp.auth().updateUser(identity.uid, {
      password: newPassword,
    });

    await otpDocRef.delete();

    const recipientEmail =
      normalizeEmail(identity.personalEmail) ||
      normalizeEmail(identity.authEmail);

    if (recipientEmail) {
      try {
        await sendMail({
          to: recipientEmail,
          subject: "CampusConnect Password Changed",
          text: `Hi ${identity.displayName || "there"},\n\nYour CampusConnect password was changed successfully.\nIf this was not you, contact your administrator immediately.\n\n- CampusConnect Team`,
        });
      } catch (mailError) {
        console.error("Password reset confirmation email failed:", mailError);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Password reset successful. You can now log in.",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Password reset error:", error);
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}
