// File text extraction helpers — ported verbatim from the legacy monolith
// (backend/server.js). Accepts the multer-like uploaded-file object
// { buffer, mimetype, originalname, size } that routes build from formData.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

// Legacy global multer fileFilter allow-list (server.js ~90-135), replicated
// so upload routes reject the same types multer rejected.
const LEGACY_UPLOAD_ALLOWED_TYPES = [
  "application/pdf",
  "text/csv",
  "application/csv",
  "text/comma-separated-values",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
  "application/zip",
  "application/x-rar-compressed",
];

export const LEGACY_UPLOAD_FILTER_ERROR_MESSAGE =
  "Invalid file type. Only documents, images, audio, video, and archives are allowed.";

export const isAllowedByLegacyUploadFilter = (file: any) => {
  const fileName = (file.originalname || "").toLowerCase();
  const isCsvByExtension = fileName.endsWith(".csv");

  return LEGACY_UPLOAD_ALLOWED_TYPES.includes(file.mimetype) || isCsvByExtension;
};

export const isCsvFile = (file: any) => {
  const csvMimeTypes = [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "text/plain",
  ];
  const byMime = csvMimeTypes.includes(file.mimetype || "");
  const byName = (file.originalname || "").toLowerCase().endsWith(".csv");
  return byMime || byName;
};

export const extractTextFromUploadedFile = async (file: any) => {
  if (isCsvFile(file)) {
    return file.buffer.toString("utf-8");
  }

  if (file.mimetype === "application/pdf") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const pdfData = await pdfParse(file.buffer);
    return pdfData.text || "";
  }

  if (file.mimetype.startsWith("image/")) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Tesseract = require("tesseract.js");
    const result = await Tesseract.recognize(file.buffer, "eng");
    return result.data.text || "";
  }

  throw new Error("Only PDF and image files are supported");
};

export const parseCsvLine = (line: any, delimiter: any) => {
  const result: any[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
};
