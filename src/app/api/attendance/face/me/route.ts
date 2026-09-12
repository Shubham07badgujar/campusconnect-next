import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireStudent } from "@/lib/server/auth-guards";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const g = await requireStudent(req);
  if (g.ok === false) return g.response;

  try {
    const firestore = adminApp.firestore();
    const faceDoc = await firestore.collection("student_faces").doc(g.uid).get();

    if (!faceDoc.exists) {
      return NextResponse.json({
        success: true,
        registered: false,
      });
    }

    const data = (faceDoc.data() || {}) as Record<string, any>;
    return NextResponse.json({
      success: true,
      registered: true,
      modelVersion: String(data.modelVersion || "face-api-v1"),
      descriptorLength: Array.isArray(data.descriptor) ? data.descriptor.length : 0,
      updatedAt: data.updatedAt || null,
      registeredAt: data.registeredAt || null,
    });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
