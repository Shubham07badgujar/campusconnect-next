import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth-guards";
import { MAX_UPLOAD_BYTES } from "@/lib/server/cloudinary";
import {
  extractTextFromUploadedFile,
  isAllowedByLegacyUploadFilter,
  isCsvFile,
  LEGACY_UPLOAD_FILTER_ERROR_MESSAGE,
} from "@/lib/server/file-text";
import {
  parseStudentsFromCsv,
  parseStudentsFromText,
} from "@/lib/server/onboarding";

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

    const extractedText = await extractTextFromUploadedFile(file);
    const entries = isCsvFile(file)
      ? parseStudentsFromCsv(extractedText)
      : parseStudentsFromText(extractedText);

    return NextResponse.json({
      success: true,
      extractedText,
      entries,
    });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
