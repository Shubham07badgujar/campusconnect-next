import { NextRequest, NextResponse } from "next/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import {
  requireAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/auth-guards";
import {
  ATTENDANCE_SETTINGS_COLLECTION,
  ATTENDANCE_SETTINGS_DOC_ID,
} from "@/lib/server/constants";
import { getAttendanceSettings } from "@/lib/server/attendance/shared";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const g = await requireAuthenticatedUser(req);
  if (g.ok === false) return g.response;

  try {
    const firestore = adminApp.firestore();
    const settings = await getAttendanceSettings(firestore);
    return NextResponse.json({ success: true, settings }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const body: Record<string, any> = await req.json().catch(() => ({}));
    const distanceEnforcementDefault = body?.distanceEnforcementDefault;

    if (typeof distanceEnforcementDefault !== "boolean") {
      return NextResponse.json(
        { message: "distanceEnforcementDefault must be a boolean value." },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();
    await firestore
      .collection(ATTENDANCE_SETTINGS_COLLECTION)
      .doc(ATTENDANCE_SETTINGS_DOC_ID)
      .set(
        {
          distanceEnforcementDefault,
          updatedBy: g.uid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return NextResponse.json(
      {
        success: true,
        message: "Attendance settings updated successfully.",
        settings: {
          distanceEnforcementDefault,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}
