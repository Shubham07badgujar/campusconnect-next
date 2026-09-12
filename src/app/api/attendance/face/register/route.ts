import { NextRequest, NextResponse } from "next/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import { requireStudent } from "@/lib/server/auth-guards";
import { normalizeFaceDescriptor } from "@/lib/server/attendance/face";
import { FACE_DESCRIPTOR_LENGTH } from "@/lib/server/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireStudent(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json();
    const studentId = g.uid;
    const payloadStudentId = String(body.studentId || "").trim();
    if (payloadStudentId && payloadStudentId !== studentId) {
      return NextResponse.json({ message: "studentId mismatch." }, { status: 403 });
    }

    const descriptor = normalizeFaceDescriptor(body.descriptor);
    if (descriptor.length !== FACE_DESCRIPTOR_LENGTH) {
      return NextResponse.json(
        {
          message: `descriptor must contain ${FACE_DESCRIPTOR_LENGTH} numeric values.`,
        },
        { status: 400 },
      );
    }

    const modelVersion = String(body.modelVersion || "face-api-v1").trim();
    const firestore = adminApp.firestore();

    const existingDoc = await firestore.collection("student_faces").doc(studentId).get();

    await firestore
      .collection("student_faces")
      .doc(studentId)
      .set(
        {
          studentId,
          descriptor,
          modelVersion,
          registeredAt: existingDoc.exists
            ? (existingDoc.data() as Record<string, any>)?.registeredAt ||
              FieldValue.serverTimestamp()
            : FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return NextResponse.json(
      {
        success: true,
        message: existingDoc.exists
          ? "Face profile updated successfully."
          : "Face profile registered successfully.",
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
