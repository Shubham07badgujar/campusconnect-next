// Exam timetable parser block — ported verbatim from the legacy monolith
// (backend/server.js ~2824-2844 constants and ~3291-4085 parsers).
import {
  buildExamGeminiModelCandidates,
  extractJsonObjectFromText,
  fetchGeminiSupportedModels,
  GEMINI_TRANSIENT_STATUS_CODES,
  normalizeGeminiModelName,
  waitForMs,
} from "@/lib/server/gemini";

const EXAM_TIMETABLE_DAY_PATTERN =
  /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i;
const EXAM_TIMETABLE_DATE_PATTERN = /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/;
const EXAM_TIMETABLE_TIME_PATTERN =
  /(\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:to|-|–)\s*\d{1,2}:\d{2}\s*(?:am|pm)?)/i;
const EXAM_TIMETABLE_COURSE_PATTERN =
  /^([A-Z]{2,4}\s?\d{3,4}[A-Z]{0,2})\s*[-–—:]\s*(.+)$/i;
const EXAM_TIMETABLE_COURSE_SPLIT_PATTERN =
  /(?=[A-Z]{2,4}\s?\d{3,4}[A-Z]{0,2}\s*[-–—:])/g;
const EXAM_TIMETABLE_BRANCH_PREFIX_PATTERN =
  /^(Civil|Computer|Electrical|E\s*&\s*T\s*&\s*C|E&TC|Instrumentation|Mechanical|Information\s+Technology|IT)\b\s*(.*)$/i;

const EXAM_TIMETABLE_BRANCH_VALUES = [
  "Civil",
  "Computer",
  "Electrical",
  "E&TC",
  "Instrumentation",
  "Mechanical",
  "Information Technology",
];

export const normalizeExamTimetableBranchName = (branchRaw: any = "") => {
  const value = String(branchRaw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (!value) return "";
  if (value === "it" || value.includes("information")) {
    return "Information Technology";
  }
  if (value.includes("civil")) return "Civil";
  if (value.includes("computer")) return "Computer";
  if (value.includes("electrical")) return "Electrical";
  if (value.includes("instrument")) return "Instrumentation";
  if (value.includes("mechanical")) return "Mechanical";
  if (
    value.includes("e&tc") ||
    value.includes("entc") ||
    value.includes("e & t & c") ||
    value.includes("electronics")
  ) {
    return "E&TC";
  }

  return String(branchRaw || "").trim();
};

export const parseExamTimetableDate = (rawDate: any = "") => {
  const originalValue = String(rawDate || "").trim();
  if (!originalValue) {
    return null;
  }

  const matchedDate =
    originalValue.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/) ||
    originalValue.match(/(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/);

  const normalizedValue = matchedDate
    ? matchedDate[1]
    : originalValue.replace(/,/g, " ");

  const dmyMatch = normalizedValue.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/,
  );
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]) - 1;
    const yearValue = Number(dmyMatch[3]);
    const year = yearValue < 100 ? 2000 + yearValue : yearValue;
    return new Date(year, month, day);
  }

  const ymdMatch = normalizedValue.match(
    /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/,
  );
  if (ymdMatch) {
    return new Date(
      Number(ymdMatch[1]),
      Number(ymdMatch[2]) - 1,
      Number(ymdMatch[3]),
    );
  }

  const parsed = new Date(normalizedValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const normalizeExamTimetableDate = (rawDate: any = "") => {
  const parsed = parseExamTimetableDate(rawDate);
  if (!parsed) {
    return String(rawDate || "").trim();
  }

  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const yyyy = String(parsed.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
};

export const getExamTimetableWeekdayFromDate = (rawDate: any = "") => {
  const parsed = parseExamTimetableDate(rawDate);
  if (!parsed) {
    return "";
  }

  return parsed.toLocaleDateString("en-US", { weekday: "long" });
};

export const formatExamTimetableTimePoint = (value: any = "") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) {
    return normalized;
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const meridiem = String(match[3] || "").toLowerCase();
  return `${hour}:${minute}${meridiem ? ` ${meridiem}` : ""}`;
};

export const normalizeExamTimetableTime = (timeRaw: any = "") => {
  const normalized = String(timeRaw || "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  const timeTokens = normalized.match(/\d{1,2}:\d{2}\s*(?:am|pm)?/gi) || [];
  if (timeTokens.length >= 2) {
    return `${formatExamTimetableTimePoint(timeTokens[0])} to ${formatExamTimetableTimePoint(timeTokens[1])}`;
  }

  return normalized;
};

export const normalizeExamTimetableCourseCode = (value: any = "") => {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
};

export const normalizeExamTimetableCourseName = (value: any = "") => {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
};

export const getExamTimeStartMinutes = (timeRange: any = "") => {
  const token = String(timeRange || "")
    .trim()
    .match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);

  if (!token) {
    return Number.POSITIVE_INFINITY;
  }

  let hours = Number.parseInt(token[1], 10);
  const minutes = Number.parseInt(token[2], 10);
  const meridiem = String(token[3] || "").toLowerCase();

  if (meridiem === "pm" && hours < 12) {
    hours += 12;
  } else if (meridiem === "am" && hours === 12) {
    hours = 0;
  }

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return Number.POSITIVE_INFINITY;
  }

  return hours * 60 + minutes;
};

export const normalizeGeminiExamTimetableEntries = (
  entries: any = [],
  selectedYear: any = "",
) => {
  if (!Array.isArray(entries)) {
    return [];
  }

  const seen = new Set();
  const normalized: any[] = [];

  entries.forEach((entry: any) => {
    const row = entry && typeof entry === "object" ? entry : {};

    const combinedCourse = String(
      row.course || row.subject || row.title || row.subjectTitle || "",
    ).trim();
    const combinedCourseMatch = combinedCourse.match(
      EXAM_TIMETABLE_COURSE_PATTERN,
    );

    const date = normalizeExamTimetableDate(
      row.date || row.examDate || row.dateSlots || row.dateSlot || "",
    );
    const time = normalizeExamTimetableTime(
      row.time || row.slot || row.examTime || row.timeSlot || "",
    );
    const branch = normalizeExamTimetableBranchName(
      row.branch || row.department || row.dept || "",
    );

    const courseCode = normalizeExamTimetableCourseCode(
      row.courseCode ||
        row.code ||
        row.subjectCode ||
        (combinedCourseMatch ? combinedCourseMatch[1] : ""),
    );
    const courseName = normalizeExamTimetableCourseName(
      row.courseName ||
        row.subjectName ||
        (combinedCourseMatch ? combinedCourseMatch[2] : combinedCourse),
    );

    if (!date || !time || !branch || !courseCode || !courseName) {
      return;
    }

    if (!EXAM_TIMETABLE_BRANCH_VALUES.includes(branch)) {
      return;
    }

    const day =
      String(row.day || row.weekday || "").trim() ||
      getExamTimetableWeekdayFromDate(date);

    const key = `${date}|${time}|${branch.toLowerCase()}|${courseCode}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    normalized.push({
      day,
      date,
      time,
      branch,
      courseCode,
      courseName,
      duration: "3 hours",
      year: String(selectedYear || row.year || "").trim(),
    });
  });

  normalized.sort((left, right) => {
    const leftDate = parseExamTimetableDate(left.date || "");
    const rightDate = parseExamTimetableDate(right.date || "");
    const leftMs = leftDate ? leftDate.getTime() : Number.POSITIVE_INFINITY;
    const rightMs = rightDate ? rightDate.getTime() : Number.POSITIVE_INFINITY;

    if (leftMs !== rightMs) {
      return leftMs - rightMs;
    }

    const leftTime = getExamTimeStartMinutes(left.time || "");
    const rightTime = getExamTimeStartMinutes(right.time || "");
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    const branchCompare = String(left.branch || "").localeCompare(
      String(right.branch || ""),
    );
    if (branchCompare !== 0) {
      return branchCompare;
    }

    return String(left.courseCode || "").localeCompare(
      String(right.courseCode || ""),
    );
  });

  return normalized;
};

export const parseExamTimetableFromText = (text: any = "", selectedYear: any = "") => {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const exams: any[] = [];
  let currentDay = "";
  let currentDate = "";
  let currentTime = "";
  let currentBranch = "";

  lines.forEach((line) => {
    const dayMatch = line.match(EXAM_TIMETABLE_DAY_PATTERN);
    const dateMatch = line.match(EXAM_TIMETABLE_DATE_PATTERN);
    const timeMatch = line.match(EXAM_TIMETABLE_TIME_PATTERN);

    if (dayMatch || dateMatch || timeMatch) {
      if (dayMatch) {
        currentDay = String(dayMatch[1] || "").trim();
      }
      if (dateMatch) {
        currentDate = normalizeExamTimetableDate(dateMatch[1]);
      }
      if (timeMatch) {
        currentTime = normalizeExamTimetableTime(timeMatch[1]);
      }

      if (dateMatch || timeMatch) {
        currentBranch = "";
      }

      if (!line.match(/[A-Z]{2,4}\s?\d{3,4}[A-Z]{0,2}\s*[-–—:]/)) {
        return;
      }
    }

    let remaining = line;
    const branchMatch = line.match(EXAM_TIMETABLE_BRANCH_PREFIX_PATTERN);
    if (branchMatch) {
      currentBranch = normalizeExamTimetableBranchName(branchMatch[1]);
      remaining = String(branchMatch[2] || "").trim();
    }

    if (
      !remaining ||
      !/[A-Z]{2,4}\s?\d{3,4}[A-Z]{0,2}\s*[-–—:]/.test(remaining)
    ) {
      return;
    }

    if (!currentDate || !currentTime) {
      return;
    }

    const courseSegments = remaining
      .split(EXAM_TIMETABLE_COURSE_SPLIT_PATTERN)
      .map((segment) => segment.trim())
      .filter(Boolean);

    courseSegments.forEach((segment) => {
      const courseMatch = segment.match(EXAM_TIMETABLE_COURSE_PATTERN);
      if (!courseMatch) {
        return;
      }

      const code = normalizeExamTimetableCourseCode(courseMatch[1]);
      const name = normalizeExamTimetableCourseName(courseMatch[2]);
      const branch = normalizeExamTimetableBranchName(currentBranch);
      if (!code || !name || !branch) {
        return;
      }

      exams.push({
        day: currentDay || getExamTimetableWeekdayFromDate(currentDate),
        date: currentDate,
        time: currentTime,
        branch,
        courseCode: code,
        courseName: name,
        duration: "3 hours",
        year: selectedYear,
      });
    });
  });

  return normalizeGeminiExamTimetableEntries(exams, selectedYear);
};

export const parseExamTimetableWithGemini = async ({
  file,
  extractedText = "",
  apiKey = "",
  selectedYear = "",
}: any) => {
  const prompt = [
    "You are parsing a year-wise engineering exam timetable.",
    "A single date/time slot can contain multiple branch rows and multiple subjects.",
    "Return strict JSON only with this shape:",
    "{",
    '  "exams": [',
    "    {",
    '      "day": "",',
    '      "date": "DD-MM-YYYY",',
    '      "time": "2:00 pm to 5:00 pm",',
    '      "branch": "",',
    '      "courseCode": "",',
    '      "courseName": ""',
    "    }",
    "  ]",
    "}",
    "Rules:",
    "- Branch must be one of: Civil, Computer, Electrical, E&TC, Instrumentation, Mechanical, Information Technology.",
    "- If one branch line contains multiple subjects, create one exams row per subject.",
    "- Keep exam time exactly as a clear range string.",
    "- Do not include markdown, comments, or additional keys.",
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
      text: `OCR extracted text (fallback context):\n${String(extractedText || "").slice(0, 30000)}`,
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

      const maxAttempts = 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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

          if (attempt < maxAttempts) {
            await waitForMs(300 * attempt);
            continue;
          }

          break;
        }

        if (!response.ok) {
          lastFailure = `Model ${modelName} failed with ${response.status}: ${rawResponse.slice(0, 220)}`;

          if (
            GEMINI_TRANSIENT_STATUS_CODES.has(Number(response.status)) &&
            attempt < maxAttempts
          ) {
            await waitForMs(350 * attempt);
            continue;
          }

          break;
        }

        let payload: any = {};
        try {
          payload = JSON.parse(rawResponse);
        } catch {
          lastFailure = `Model ${modelName}: non-JSON payload`;
          break;
        }

        const modelText = (payload?.candidates || [])
          .flatMap((candidateItem: any) => candidateItem?.content?.parts || [])
          .map((part: any) => String(part?.text || ""))
          .join("\n")
          .trim();

        if (!modelText) {
          lastFailure = `Model ${modelName}: empty content`;
          break;
        }

        const structured = extractJsonObjectFromText(modelText);
        if (!structured || typeof structured !== "object") {
          lastFailure = `Model ${modelName}: invalid structured JSON`;
          break;
        }

        const entries = Array.isArray(structured.exams)
          ? structured.exams
          : Array.isArray(structured.entries)
            ? structured.entries
            : [];

        const normalized = normalizeGeminiExamTimetableEntries(
          entries,
          selectedYear,
        );
        if (normalized.length > 0) {
          return normalized;
        }

        lastFailure = `Model ${modelName}: parsed 0 valid exam rows`;
        break;
      }
    }

    return null;
  };

  let parsed = await tryModels(buildExamGeminiModelCandidates());

  if (!parsed) {
    const discoveredModels = await fetchGeminiSupportedModels(apiKey);
    if (discoveredModels.length > 0) {
      const discoveredPreferred = discoveredModels.filter((modelName: any) =>
        /flash/i.test(modelName),
      );
      const discoveredOthers = discoveredModels.filter(
        (modelName: any) => !/flash/i.test(modelName),
      );

      parsed = await tryModels(
        buildExamGeminiModelCandidates([
          ...discoveredPreferred,
          ...discoveredOthers,
        ]),
      );
    }
  }

  if (!parsed) {
    const tried = Array.from(triedModels).join(", ");
    throw new Error(
      `Gemini exam timetable parse failed for models [${tried}]. ${lastFailure}`,
    );
  }

  return parsed;
};
