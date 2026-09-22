import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth-guards";
import { MAX_UPLOAD_BYTES, uploadBufferToCloudinary } from "@/lib/server/cloudinary";
import {
  extractTextFromUploadedFile,
  isAllowedByLegacyUploadFilter,
  LEGACY_UPLOAD_FILTER_ERROR_MESSAGE,
} from "@/lib/server/file-text";
import { getGeminiApiKeyFromRequest } from "@/lib/server/gemini";
import {
  parseExamTimetableFromText,
  parseExamTimetableWithGemini,
} from "@/lib/server/exam-timetable";
import { logger, reportError } from "@/lib/server/logger";

export const runtime = "nodejs";

// Upload exam timetable PDF and extract text
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

    const year = form.get("year") as any;
    if (!year) {
      return NextResponse.json({ message: "Year is required" }, { status: 400 });
    }

    const isSupportedFile =
      file.mimetype === "application/pdf" ||
      file.mimetype.startsWith("image/");
    if (!isSupportedFile) {
      return NextResponse.json(
        { message: "Only PDF and image files are supported" },
        { status: 400 },
      );
    }

    const extractedText = await extractTextFromUploadedFile(file);
    const geminiApiKey = getGeminiApiKeyFromRequest(req, {
      geminiApiKey: form.get("geminiApiKey"),
    });

    let parsedExams: any[] = [];
    let structuredBy = "legacy";

    if (geminiApiKey) {
      try {
        parsedExams = await parseExamTimetableWithGemini({
          file,
          extractedText,
          apiKey: geminiApiKey,
          selectedYear: year,
        });

        if (parsedExams.length > 0) {
          structuredBy = "gemini";
        }
      } catch (geminiError: any) {
        logger.warn("Gemini exam timetable parsing failed; using text fallback", {
          route: "/api/upload-exam-timetable",
          err: { name: "GeminiParseError", message: String(geminiError?.message) },
        });
      }
    }

    if (parsedExams.length === 0) {
      parsedExams = parseExamTimetableFromText(extractedText, year);
    }

    // Upload the original file to Cloudinary for reference
    const uploadResult: any = await uploadBufferToCloudinary(file.buffer, {
      folder: "campus-connect/exam-timetables",
      resource_type: "auto",
      public_id: `exam-timetable-${String(year || "year").replace(/\s+/g, "-")}-${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      extractedText,
      parsedExams,
      structuredBy,
      fileURL: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      fileName: file.originalname,
      message: "File uploaded and text extracted successfully",
    });
  } catch (error: any) {
    reportError("Exam timetable upload error", error, {
      route: "/api/upload-exam-timetable",
    });
    return NextResponse.json(
      {
        message: "Failed to process exam timetable",
        error: error.message,
      },
      { status: 500 },
    );
  }
}
