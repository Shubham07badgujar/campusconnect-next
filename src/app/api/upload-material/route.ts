import { NextRequest, NextResponse } from "next/server";
import { requireTeacherOrAdmin } from "@/lib/server/auth-guards";
import { MAX_UPLOAD_BYTES, uploadBufferToCloudinary } from "@/lib/server/cloudinary";
import {
  isAllowedByLegacyUploadFilter,
  LEGACY_UPLOAD_FILTER_ERROR_MESSAGE,
} from "@/lib/server/file-text";
import { reportError } from "@/lib/server/logger";

export const runtime = "nodejs";

// Cloudinary File Upload Endpoint
export async function POST(req: NextRequest) {
  // Only teachers and admins may publish study materials
  const g = await requireTeacherOrAdmin(req);
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

    // Get file info
    const title: any = form.get("title");

    // Upload to Cloudinary
    const uploadResult: any = await uploadBufferToCloudinary(file.buffer, {
      folder: "campus-connect/materials",
      resource_type: "auto", // Automatically detect file type
      public_id: `${Date.now()}-${title.replace(/[^a-zA-Z0-9]/g, "_")}`,
    });

    // Return the uploaded file info
    return NextResponse.json({
      success: true,
      fileURL: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      fileSize: uploadResult.bytes,
      format: uploadResult.format,
      resourceType: uploadResult.resource_type,
    });
  } catch (error: any) {
    reportError("Upload error", error, { route: "/api/upload-material" });
    return NextResponse.json(
      {
        message: "Failed to upload file",
        error: error.message,
      },
      { status: 500 },
    );
  }
}
