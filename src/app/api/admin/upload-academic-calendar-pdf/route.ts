import { NextRequest, NextResponse } from "next/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";
import { MAX_UPLOAD_BYTES, uploadBufferToCloudinary } from "@/lib/server/cloudinary";
import {
  isAllowedByLegacyUploadFilter,
  LEGACY_UPLOAD_FILTER_ERROR_MESSAGE,
} from "@/lib/server/file-text";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const form = await req.formData();
    const fileEntry = form.get("file") as File | null;

    if (!fileEntry) {
      return NextResponse.json({ message: "No file uploaded" }, { status: 400 });
    }

    const file = {
      buffer: Buffer.from(await fileEntry.arrayBuffer()),
      mimetype: fileEntry.type,
      originalname: fileEntry.name,
      size: fileEntry.size,
    };

    // Legacy multer fileFilter + 10MB limit, replicated
    if (!isAllowedByLegacyUploadFilter(file)) {
      return NextResponse.json(
        { message: LEGACY_UPLOAD_FILTER_ERROR_MESSAGE },
        { status: 400 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { message: "Uploaded file exceeds the 10MB limit" },
        { status: 413 },
      );
    }

    if (file.mimetype !== "application/pdf") {
      return NextResponse.json(
        { message: "Only PDF files are supported" },
        { status: 400 },
      );
    }

    const academicYear =
      String(form.get("academicYear") || "")
        .trim()
        .replace(/\s+/g, " ") || "General";

    const uploadResult: any = await uploadBufferToCloudinary(file.buffer, {
      folder: "campus-connect/academic-calendar-pdfs",
      resource_type: "auto",
      public_id: `academic-calendar-${academicYear.replace(/\s+/g, "-")}-${Date.now()}`,
    });

    const firestore = adminApp.firestore();
    const existingSnapshot = await firestore
      .collection("academic_calendar_files")
      .where("academicYear", "==", academicYear)
      .where("active", "==", true)
      .get();

    if (!existingSnapshot.empty) {
      const deactivateBatch = firestore.batch();
      existingSnapshot.docs.forEach((docSnap) => {
        deactivateBatch.set(
          docSnap.ref,
          {
            active: false,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
      await deactivateBatch.commit();
    }

    const fileRef = firestore.collection("academic_calendar_files").doc();
    const payload = {
      id: fileRef.id,
      academicYear,
      fileName: file.originalname || "academic-calendar.pdf",
      fileURL: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      mimeType: file.mimetype,
      sizeBytes: Number(file.size || 0),
      active: true,
      uploadedBy: g.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await fileRef.set(payload);

    return NextResponse.json(
      {
        success: true,
        message: "Academic calendar PDF uploaded successfully",
        file: {
          ...payload,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
      { status: 201 },
    );
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
