import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";
import { reportError } from "@/lib/server/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  const body = await req.json();
  const { uid } = body;

  if (!uid) {
    return NextResponse.json(
      { message: "UID is required to set role" },
      { status: 400 },
    );
  }

  try {
    await adminApp.auth().setCustomUserClaims(uid, { teacher: true });
    return NextResponse.json(
      { message: "Teacher role assigned successfully!" },
      { status: 200 },
    );
  } catch (error) {
    reportError("Error setting teacher role", error, {
      route: "/api/teachers/set-role",
    });
    return NextResponse.json(
      {
        message: "Failed to set teacher role",
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
