import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { normalizeEmail } from "@/lib/server/utils";
import { findTeacherByLoginIdentifier } from "@/lib/server/users";
import { reportError } from "@/lib/server/logger";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ loginId: string }> },
) {
  try {
    const { loginId: loginIdParam } = await params;
    const loginId = String(loginIdParam || "").trim();
    if (!loginId) {
      return NextResponse.json(
        { message: "Login ID is required." },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();
    const teacherMatch = await findTeacherByLoginIdentifier(firestore, loginId);
    if (!teacherMatch) {
      return NextResponse.json(
        { message: "Teacher login ID not found." },
        { status: 404 },
      );
    }

    const teacherData = teacherMatch.teacherData || {};
    const resolvedEmail =
      normalizeEmail(teacherData.authEmail) ||
      normalizeEmail(teacherData.email) ||
      normalizeEmail(teacherData.contactEmail) ||
      normalizeEmail(teacherMatch.authEmail) ||
      "";

    if (!resolvedEmail) {
      return NextResponse.json(
        { message: "Teacher auth email not found." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        loginId: teacherMatch.loginId,
        email: resolvedEmail,
      },
      { status: 200 },
    );
  } catch (error) {
    reportError("Error resolving teacher login", error, {
      route: "/api/teachers/resolve-login/[loginId]",
    });
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}
