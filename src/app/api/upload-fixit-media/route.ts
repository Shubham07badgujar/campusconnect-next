import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth-guards";
import { MAX_UPLOAD_BYTES, uploadBufferToCloudinary } from "@/lib/server/cloudinary";
import {
  isAllowedByLegacyUploadFilter,
  LEGACY_UPLOAD_FILTER_ERROR_MESSAGE,
} from "@/lib/server/file-text";

export const runtime = "nodejs";

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

    const normalizedMimeType = String(file.mimetype || "").toLowerCase();
    const explicitType = String(form.get("attachmentType") || "")
      .trim()
      .toLowerCase();

    let mediaType = "";
    if (explicitType === "image" || explicitType === "video") {
      mediaType = explicitType;
    } else if (normalizedMimeType.startsWith("image/")) {
      mediaType = "image";
    } else if (normalizedMimeType.startsWith("video/")) {
      mediaType = "video";
    }

    if (!mediaType) {
      return NextResponse.json(
        { message: "Only image and video files are supported." },
        { status: 400 },
      );
    }

    const safeOriginalName = String(file.originalname || "fixit_media")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80);
    const baseName = safeOriginalName.replace(/\.[^.]+$/, "") || "fixit_media";

    const uploadResult: any = await uploadBufferToCloudinary(file.buffer, {
      folder: "campus-connect/fixit",
      resource_type: "auto",
      public_id: `${g.uid}_${Date.now()}_${baseName}`,
    });

    return NextResponse.json({
      success: true,
      media: {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        name: file.originalname || "media",
        mimeType: file.mimetype || "application/octet-stream",
        size: Number(file.size) || Number(uploadResult.bytes) || 0,
        type: mediaType,
        format: uploadResult.format || "",
        resourceType: uploadResult.resource_type || "raw",
      },
    });
  } catch (error: any) {
    console.error("FixIt media upload error:", error);
    return NextResponse.json(
      {
        message: "Failed to upload FixIt media",
        error: error.message,
      },
      { status: 500 },
    );
  }
}
