import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth-guards";
import { MAX_UPLOAD_BYTES, uploadBufferToCloudinary } from "@/lib/server/cloudinary";
import {
  isAllowedByLegacyUploadFilter,
  LEGACY_UPLOAD_FILTER_ERROR_MESSAGE,
} from "@/lib/server/file-text";

export const runtime = "nodejs";

// Profile Picture Upload Endpoint
export async function POST(req: NextRequest) {
  const g = await requireAuthenticatedUser(req);
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

    // Upload to Cloudinary
    const uploadResult: any = await uploadBufferToCloudinary(file.buffer, {
      folder: "campus-connect/profiles",
      resource_type: "image",
      transformation: [
        { width: 500, height: 500, crop: "fill", gravity: "face" },
        { quality: "auto" },
      ],
    });

    // Return the uploaded file URL
    return NextResponse.json({
      success: true,
      url: uploadResult.secure_url,
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        message: "Failed to upload image",
        error: error.message,
      },
      { status: 500 },
    );
  }
}
