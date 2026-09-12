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

    const safeOriginalName = String(file.originalname || "attachment")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80);
    const baseName = safeOriginalName.replace(/\.[^.]+$/, "") || "attachment";

    const uploadResult: any = await uploadBufferToCloudinary(file.buffer, {
      folder: "campus-connect/chats",
      resource_type: "auto",
      public_id: `${g.uid}_${Date.now()}_${baseName}`,
    });

    const explicitType = String(form.get("attachmentType") || "")
      .trim()
      .toLowerCase();
    const normalizedMimeType = String(file.mimetype || "").toLowerCase();

    let attachmentType = "document";
    if (
      ["voice", "audio", "video", "image", "document"].includes(explicitType)
    ) {
      attachmentType = explicitType;
    } else if (normalizedMimeType.startsWith("image/")) {
      attachmentType = "image";
    } else if (normalizedMimeType.startsWith("video/")) {
      attachmentType = "video";
    } else if (normalizedMimeType.startsWith("audio/")) {
      attachmentType = "audio";
    }

    const durationSec = Number(form.get("durationSec") || 0) || 0;

    return NextResponse.json({
      success: true,
      attachment: {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        name: file.originalname || "attachment",
        mimeType: file.mimetype || "application/octet-stream",
        size: Number(file.size) || Number(uploadResult.bytes) || 0,
        type: attachmentType,
        format: uploadResult.format || "",
        resourceType: uploadResult.resource_type || "raw",
        durationSec,
      },
    });
  } catch (error: any) {
    console.error("Chat attachment upload error:", error);
    return NextResponse.json(
      {
        message: "Failed to upload chat attachment",
        error: error.message,
      },
      { status: 500 },
    );
  }
}
