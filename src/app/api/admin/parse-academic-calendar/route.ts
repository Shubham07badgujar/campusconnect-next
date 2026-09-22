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
  parseAcademicCalendarFromCsv,
  parseAcademicCalendarFromText,
  parseAcademicHolidaysFromCsv,
  parseAcademicHolidaysFromText,
} from "@/lib/server/academic-calendar";
import {
  getGeminiApiKeyFromRequest,
  parseAcademicCalendarWithGemini,
} from "@/lib/server/gemini";
import { reportError } from "@/lib/server/logger";

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
    const isCsv = isCsvFile(file);
    const geminiApiKey = getGeminiApiKeyFromRequest(req, {
      geminiApiKey: form.get("geminiApiKey"),
    });

    let entries: any[] = [];
    let holidayEntries: any[] = [];
    let structuredBy = "legacy";

    if (!isCsv && geminiApiKey) {
      try {
        const geminiStructured = await parseAcademicCalendarWithGemini({
          file,
          extractedText,
          apiKey: geminiApiKey,
        });

        entries = geminiStructured.entries;
        holidayEntries = geminiStructured.holidayEntries;
        structuredBy = "gemini";
      } catch (geminiError) {
        reportError("Gemini academic calendar parsing failed", geminiError, {
          route: "/api/admin/parse-academic-calendar",
          // Not fatal: the text/CSV parser below is the fallback.
          degraded: true,
        });
      }
    }

    if (entries.length === 0) {
      entries = isCsv
        ? parseAcademicCalendarFromCsv(extractedText)
        : parseAcademicCalendarFromText(extractedText);
    }

    if (holidayEntries.length === 0) {
      holidayEntries = isCsv
        ? parseAcademicHolidaysFromCsv(extractedText)
        : parseAcademicHolidaysFromText(extractedText);
    }

    return NextResponse.json({
      success: true,
      extractedText,
      entries,
      holidayEntries,
      structuredBy,
    });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
