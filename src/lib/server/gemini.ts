// Gemini request/parse helpers — ported verbatim from the legacy monolith
// (backend/server.js ~2797-3289).
import type { NextRequest } from "next/server";
import {
  extractAcademicHolidayName,
  getAcademicColorByCategory,
  getAcademicIconByCategory,
  normalizeAcademicCalendarCategory,
  normalizeAcademicRescheduledDate,
  normalizeAcademicResponsibility,
  parseAcademicDateValue,
  resolveAcademicDateRange,
} from "@/lib/server/academic-calendar";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
export const GEMINI_MODEL_FALLBACKS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro-latest",
  "gemini-1.5-flash",
];

export const EXAM_TIMETABLE_FAST_GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
];

export const GEMINI_TRANSIENT_STATUS_CODES = new Set([429, 500, 503, 504]);

export const normalizeGeminiModelName = (value: any = "") => {
  return String(value || "")
    .trim()
    .replace(/^models\//i, "");
};

export const buildGeminiModelCandidates = (additional: any = []) => {
  const seen = new Set();
  const ordered: any[] = [];

  [GEMINI_MODEL, ...GEMINI_MODEL_FALLBACKS, ...additional].forEach((item) => {
    const normalized = normalizeGeminiModelName(item);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    ordered.push(normalized);
  });

  return ordered;
};

// Legacy read the key from headers, then the parsed request body, then env.
// Next.js routes pass the already-parsed body (JSON fields or formData text
// fields) because the request body cannot be re-read here.
export const getGeminiApiKeyFromRequest = (req: NextRequest, body: any = {}) => {
  const headerKey = String(
    req.headers.get("x-gemini-api-key") || req.headers.get("x-gemini-key") || "",
  ).trim();

  const bodyKey =
    typeof body?.geminiApiKey === "string"
      ? body.geminiApiKey.trim()
      : "";

  const envKey = String(
    process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "",
  ).trim();

  return headerKey || bodyKey || envKey;
};

export const fetchGeminiSupportedModels = async (apiKey: any = "") => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      {
        method: "GET",
      },
    );

    const rawResponse = await response.text();
    if (!response.ok) {
      return [];
    }

    const payload = JSON.parse(rawResponse);
    const models = Array.isArray(payload?.models) ? payload.models : [];

    return models
      .filter((model: any) => {
        const methods = Array.isArray(model?.supportedGenerationMethods)
          ? model.supportedGenerationMethods
          : [];
        return methods.includes("generateContent");
      })
      .map((model: any) => normalizeGeminiModelName(model?.name || ""))
      .filter(Boolean);
  } catch {
    return [];
  }
};

export const waitForMs = async (durationMs: any = 0) => {
  const safeDuration = Math.max(0, Number(durationMs) || 0);
  return new Promise((resolve) => {
    setTimeout(resolve, safeDuration);
  });
};

export const buildExamGeminiModelCandidates = (additional: any = []) => {
  const seen = new Set();
  const ordered: any[] = [];

  [
    process.env.GEMINI_EXAM_MODEL || "",
    ...EXAM_TIMETABLE_FAST_GEMINI_MODELS,
    ...buildGeminiModelCandidates(),
    ...additional,
  ].forEach((item) => {
    const normalized = normalizeGeminiModelName(item);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    ordered.push(normalized);
  });

  return ordered;
};

export const extractJsonObjectFromText = (value: any = "") => {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const withoutFence = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    // Continue to brace-based extraction.
  }

  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = withoutFence.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  return null;
};

export const normalizeGeminiAcademicEntries = (entries: any = []) => {
  if (!Array.isArray(entries)) {
    return [];
  }

  const seen = new Set();
  const normalized: any[] = [];

  entries.forEach((entry: any) => {
    const row = entry && typeof entry === "object" ? entry : {};
    const activity = String(
      row.activity || row.title || row.event || row.name || "",
    )
      .replace(/\s+/g, " ")
      .trim();
    const dateSlots = String(
      row.dateSlots || row.date || row.dateRange || row.slots || "",
    )
      .replace(/\s+/g, " ")
      .trim();

    const rangeFromSlots = resolveAcademicDateRange(dateSlots);
    const startDate =
      parseAcademicDateValue(row.startDate || row.start || "") ||
      rangeFromSlots.startDate;
    const endDate =
      parseAcademicDateValue(row.endDate || row.end || "") ||
      rangeFromSlots.endDate ||
      startDate;

    if (!activity || !startDate) {
      return;
    }

    const responsibility = normalizeAcademicResponsibility(
      row.responsibility || row.owner || "--",
    );
    const category = normalizeAcademicCalendarCategory(
      row.category || "",
      activity,
    );
    const color =
      String(row.color || "")
        .trim()
        .toLowerCase() || getAcademicColorByCategory(category);
    const icon =
      String(row.icon || "")
        .trim()
        .toLowerCase() || getAcademicIconByCategory(category);

    const key = `${activity.toLowerCase()}|${startDate}|${endDate}|${responsibility.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    normalized.push({
      activity,
      dateSlots: dateSlots || startDate,
      startDate,
      endDate,
      responsibility,
      category,
      color,
      icon,
      sourceLine: "gemini",
      validationErrors: [],
    });
  });

  return normalized;
};

export const normalizeGeminiHolidayEntries = (entries: any = []) => {
  if (!Array.isArray(entries)) {
    return [];
  }

  const seen = new Set();
  const normalized: any[] = [];

  entries.forEach((entry: any) => {
    const row = entry && typeof entry === "object" ? entry : {};

    const rawDateSlots = String(
      row.dateSlots || row.holidayDate || row.date || row.dateRange || "",
    )
      .replace(/\s+/g, " ")
      .trim();

    const activityRaw = String(
      row.activity || row.holiday || row.holidayName || row.name || "",
    )
      .replace(/\s+/g, " ")
      .trim();

    const activity =
      activityRaw || extractAcademicHolidayName(`${rawDateSlots}`) || "";

    const rangeFromSlots = resolveAcademicDateRange(rawDateSlots);
    const startDate =
      parseAcademicDateValue(row.startDate || row.date || "") ||
      rangeFromSlots.startDate;
    const endDate =
      parseAcademicDateValue(row.endDate || "") ||
      rangeFromSlots.endDate ||
      startDate;

    if (!activity || !startDate) {
      return;
    }

    const rescheduledDateForAcademics = normalizeAcademicRescheduledDate(
      row.rescheduledDateForAcademics ||
        row.rescheduledDate ||
        row.rescheduled ||
        row.rescheduledForAcademics ||
        "",
    );

    const responsibility = rescheduledDateForAcademics
      ? `Rescheduled: ${rescheduledDateForAcademics}`
      : normalizeAcademicResponsibility(row.responsibility || "--");

    const key = `${activity.toLowerCase()}|${startDate}|${rescheduledDateForAcademics.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    normalized.push({
      activity,
      dateSlots: rawDateSlots || startDate,
      startDate,
      endDate,
      responsibility,
      rescheduledDateForAcademics,
      category: "holiday",
      color: "green",
      icon: "umbrella",
      sourceLine: "gemini",
      validationErrors: [],
    });
  });

  return normalized;
};

export const parseAcademicCalendarWithGemini = async ({
  file,
  extractedText = "",
  apiKey = "",
}: any) => {
  const prompt = [
    "You are parsing an institute academic calendar document.",
    "The document has two independent sections that must not be mixed:",
    "1) Main table: Activity | Date/Slots | Responsibility",
    "2) Right-side table: Public Holidays | Rescheduled Date for Academics",
    "Return strict JSON object with exactly this shape:",
    "{",
    '  "entries": [',
    "    {",
    '      "activity": "",',
    '      "dateSlots": "",',
    '      "startDate": "YYYY-MM-DD",',
    '      "endDate": "YYYY-MM-DD",',
    '      "responsibility": "",',
    '      "category": "academic",',
    '      "color": "blue",',
    '      "icon": "graduation"',
    "    }",
    "  ],",
    '  "holidayEntries": [',
    "    {",
    '      "activity": "",',
    '      "dateSlots": "",',
    '      "startDate": "YYYY-MM-DD",',
    '      "endDate": "YYYY-MM-DD",',
    '      "rescheduledDateForAcademics": "",',
    '      "responsibility": "",',
    '      "category": "holiday",',
    '      "color": "green",',
    '      "icon": "umbrella"',
    "    }",
    "  ]",
    "}",
    "Rules:",
    "- Do not include any markdown or explanation outside JSON.",
    "- Keep only main-table rows inside entries.",
    "- Keep only public-holiday rows inside holidayEntries.",
    "- For missing rescheduled date use empty string.",
    "- Preserve full dateSlots text as seen in the document.",
  ].join("\n");

  const parts: any[] = [{ text: prompt }];

  if (file?.buffer?.length) {
    parts.push({
      inline_data: {
        mime_type: file.mimetype || "application/octet-stream",
        data: file.buffer.toString("base64"),
      },
    });
  }

  if (extractedText) {
    parts.push({
      text: `Fallback extracted text (can be noisy):\n${String(extractedText || "").slice(0, 30000)}`,
    });
  }

  const requestBody = JSON.stringify({
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  });

  const triedModels = new Set();
  let lastFailure = "";

  const tryModels = async (models: any = []) => {
    for (const candidate of models) {
      const modelName = normalizeGeminiModelName(candidate);
      if (!modelName || triedModels.has(modelName)) {
        continue;
      }
      triedModels.add(modelName);

      let response;
      let rawResponse = "";

      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: requestBody,
          },
        );
        rawResponse = await response.text();
      } catch (error: any) {
        lastFailure = `Model ${modelName}: ${error.message}`;
        continue;
      }

      if (!response.ok) {
        lastFailure = `Model ${modelName} failed with ${response.status}: ${rawResponse.slice(0, 240)}`;
        continue;
      }

      let payload: any = {};
      try {
        payload = JSON.parse(rawResponse);
      } catch {
        lastFailure = `Model ${modelName}: non-JSON payload`;
        continue;
      }

      const modelText = (payload?.candidates || [])
        .flatMap((candidateItem: any) => candidateItem?.content?.parts || [])
        .map((part: any) => String(part?.text || ""))
        .join("\n")
        .trim();

      if (!modelText) {
        lastFailure = `Model ${modelName}: empty content`;
        continue;
      }

      const structured = extractJsonObjectFromText(modelText);
      if (!structured || typeof structured !== "object") {
        lastFailure = `Model ${modelName}: invalid structured JSON`;
        continue;
      }

      return {
        entries: normalizeGeminiAcademicEntries(structured.entries),
        holidayEntries: normalizeGeminiHolidayEntries(
          structured.holidayEntries,
        ),
      };
    }

    return null;
  };

  let parsed = await tryModels(buildGeminiModelCandidates());
  if (!parsed) {
    const discoveredModels = await fetchGeminiSupportedModels(apiKey);
    if (discoveredModels.length > 0) {
      parsed = await tryModels(buildGeminiModelCandidates(discoveredModels));
    }
  }

  if (!parsed) {
    const tried = Array.from(triedModels).join(", ");
    throw new Error(
      `Gemini request failed for available models [${tried}]. ${lastFailure}`,
    );
  }

  return parsed;
};
