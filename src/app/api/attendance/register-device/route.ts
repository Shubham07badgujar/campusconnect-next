import { NextRequest, NextResponse } from "next/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import { requireStudent } from "@/lib/server/auth-guards";
import { normalizeDeviceId } from "@/lib/server/utils";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireStudent(req);
  if (g.ok === false) return g.response;

  try {
    const body: Record<string, any> = await req.json().catch(() => ({}));
    const deviceId = normalizeDeviceId(body.deviceId || "");
    if (!deviceId) {
      return NextResponse.json(
        { message: "deviceId is required." },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();
    await firestore.collection("student_devices").doc(g.token.uid).set(
      {
        studentId: g.token.uid,
        deviceId,
        registeredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json(
      { success: true, message: "Trusted device registered." },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}
