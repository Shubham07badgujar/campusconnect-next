import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json();
    const { uid } = body;
    if (!uid) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    await adminApp.auth().deleteUser(uid);
    return NextResponse.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
