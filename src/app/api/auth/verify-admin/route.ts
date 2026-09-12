import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token } = body;

  try {
    const decodedToken = await adminApp.auth().verifyIdToken(token);
    if (decodedToken.admin) {
      return NextResponse.json({ message: "Authorized as admin" }, { status: 200 });
    } else {
      return NextResponse.json({ message: "Not authorized" }, { status: 403 });
    }
  } catch (error) {
    return NextResponse.json({ message: "Invalid token", error }, { status: 401 });
  }
}
