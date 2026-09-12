// Academic calendar parsing block — ported verbatim from the legacy monolith
// (backend/server.js ~2000-2795).
import { parseCsvLine } from "@/lib/server/file-text";

export const normalizeAcademicCalendarCategory = (value: any = "", fallback: any = "") => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  const source =
    raw ||
    String(fallback || "")
      .trim()
      .toLowerCase();

  if (!source) return "academic";
  if (source.includes("exam")) return "exam";
  if (
    source.includes("holiday") ||
    source.includes("vacation") ||
    source.includes("break")
  ) {
    return "holiday";
  }
  if (
    source.includes("event") ||
    source.includes("activity") ||
    source.includes("workshop") ||
    source.includes("seminar")
  ) {
    return "event";
  }
  return "academic";
};

export const getAcademicColorByCategory = (category: any = "academic") => {
  const palette: any = {
    academic: "blue",
    exam: "red",
    event: "cyan",
    holiday: "green",
  };
  return palette[category] || "blue";
};

export const getAcademicIconByCategory = (category: any = "academic") => {
  const icons: any = {
    academic: "graduation",
    exam: "clipboard",
    event: "flask",
    holiday: "umbrella",
  };
  return icons[category] || "calendar";
};

const MONTH_INDEX: any = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const ACADEMIC_ROW_DATE_SEGMENT_PATTERN =
  /(\d{1,2}\s*(?:-|–|to)\s*\d{1,2}\s*[A-Za-z]{3,12}[.,]?\s*\d{4}|\d{1,2}\s+[A-Za-z]{3,12}[.,]?\s*(?:-|–|to)\s*\d{1,2}\s+[A-Za-z]{3,12}[.,]?\s*\d{4}|\d{1,2}\s+[A-Za-z]{3,12}[.,]?\s*\d{4}\s*(?:-|–|to)\s*\d{1,2}\s+[A-Za-z]{3,12}[.,]?\s*\d{4}|\d{1,2}\s+[A-Za-z]{3,12}[.,]?\s*\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}(?:\s*(?:-|–|to)\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})?)/i;

const toIsoDate = (dateObj: any) => {
  if (!dateObj || Number.isNaN(dateObj.getTime())) {
    return "";
  }

  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const parseAcademicDateValue = (value: any = "", fallbackYear: any = 0) => {
  const raw = String(value || "")
    .replace(/[,]/g, " ")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) {
    return "";
  }

  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]) - 1;
    const parsedYear = Number(dmy[3]);
    const year = parsedYear < 100 ? 2000 + parsedYear : parsedYear;
    return toIsoDate(new Date(year, month, day));
  }

  const dayMonthYear = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,12})\s*(\d{4})?$/);
  if (dayMonthYear) {
    const day = Number(dayMonthYear[1]);
    const monthToken = String(dayMonthYear[2] || "").toLowerCase();
    const monthIndex = MONTH_INDEX[monthToken];
    const year = Number(dayMonthYear[3] || fallbackYear || 0);
    if (Number.isInteger(monthIndex) && year > 0) {
      return toIsoDate(new Date(year, monthIndex, day));
    }
  }

  const parsed = new Date(raw);
  return toIsoDate(parsed);
};

export const resolveAcademicDateRange = (dateSlots: any = ""): any => {
  const raw = String(dateSlots || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) {
    return { startDate: "", endDate: "" };
  }

  const fullTextRange = raw.match(
    /^(\d{1,2})\s+([A-Za-z]{3,12})\s*(\d{4})\s*(?:-|–|to)\s*(\d{1,2})\s+([A-Za-z]{3,12})\s*(\d{4})$/i,
  );
  if (fullTextRange) {
    const startDate = parseAcademicDateValue(
      `${fullTextRange[1]} ${fullTextRange[2]} ${fullTextRange[3]}`,
    );
    const endDate = parseAcademicDateValue(
      `${fullTextRange[4]} ${fullTextRange[5]} ${fullTextRange[6]}`,
    );
    return {
      startDate,
      endDate: endDate || startDate,
    };
  }

  const twoMonthOneYearRange = raw.match(
    /^(\d{1,2})\s+([A-Za-z]{3,12})\s*(?:-|–|to)\s*(\d{1,2})\s+([A-Za-z]{3,12})\s*(\d{4})$/i,
  );
  if (twoMonthOneYearRange) {
    const year = Number(twoMonthOneYearRange[5]);
    const startDate = parseAcademicDateValue(
      `${twoMonthOneYearRange[1]} ${twoMonthOneYearRange[2]} ${year}`,
      year,
    );
    const endDate = parseAcademicDateValue(
      `${twoMonthOneYearRange[3]} ${twoMonthOneYearRange[4]} ${year}`,
      year,
    );
    return {
      startDate,
      endDate: endDate || startDate,
    };
  }

  const sameMonthRange = raw.match(
    /^(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s+([A-Za-z]{3,12})\s*(\d{4})$/i,
  );
  if (sameMonthRange) {
    const year = Number(sameMonthRange[4]);
    const startDate = parseAcademicDateValue(
      `${sameMonthRange[1]} ${sameMonthRange[3]} ${year}`,
      year,
    );
    const endDate = parseAcademicDateValue(
      `${sameMonthRange[2]} ${sameMonthRange[3]} ${year}`,
      year,
    );
    return {
      startDate,
      endDate: endDate || startDate,
    };
  }

  const numericRange = raw.match(
    /^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s*(?:-|–|to)\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})$/i,
  );
  if (numericRange) {
    const startDate = parseAcademicDateValue(numericRange[1]);
    const endDate = parseAcademicDateValue(numericRange[2]);
    return {
      startDate,
      endDate: endDate || startDate,
    };
  }

  const segmentedCandidate = raw.match(ACADEMIC_ROW_DATE_SEGMENT_PATTERN);
  if (segmentedCandidate?.[1]) {
    const firstSegment = String(segmentedCandidate[1]).trim();
    if (firstSegment && firstSegment.toLowerCase() !== raw.toLowerCase()) {
      return resolveAcademicDateRange(firstSegment);
    }
  }

  const singleDate = parseAcademicDateValue(raw);
  return {
    startDate: singleDate,
    endDate: singleDate,
  };
};

const ACADEMIC_RESPONSIBILITY_PATTERN =
  /(Dean\s*\([^)]*\)\s*and\s*HoD|Dean\s*\([^)]*\)|Office\s*and\s*HoD|Course\s*Teacher\s*and\s*Coordinator|HoD\s*and\s*CoE|Dean\s*\(S\.A\.\)|Dean|HoD|CoE|Course\s*Teacher|Coordinator|Office)/i;

const ACADEMIC_HOLIDAY_SIDEBAR_KEYWORDS = [
  "public holidays",
  "rescheduled date for academics",
  "important points to be noted",
  "time-table",
  "audit points",
  "republic day",
  "shivaji maharaj jayanti",
  "holi",
  "gudi padwa",
  "ramzan",
  "ram navami",
  "mahavir jayanti",
  "good friday",
  "ambedkar jayanti",
];

const ACADEMIC_HOLIDAY_NAME_HINT_PATTERN =
  /(republic|jayanti|holi|gudi|ramzan|ram\s*navami|good\s*friday|public\s*holiday|id)/i;

const ACADEMIC_RESCHEDULE_HINT_PATTERN =
  /(rescheduled|time-?table|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;

export const normalizeAcademicResponsibility = (value: any = "") => {
  const raw = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) {
    return "--";
  }

  const roleMatch = raw.match(ACADEMIC_RESPONSIBILITY_PATTERN);
  if (roleMatch?.[0]) {
    return String(roleMatch[0]).trim();
  }

  const firstDateIndex = raw.search(/\b\d{1,2}\s+[A-Za-z]{3,12}\s+\d{4}\b/);
  if (firstDateIndex > 0) {
    const left = raw.slice(0, firstDateIndex).trim();
    return left || "--";
  }

  return raw;
};

export const isAcademicHolidaySidebarLine = (value: any = "") => {
  const raw = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) {
    return false;
  }

  const lower = raw.toLowerCase();
  if (
    ACADEMIC_HOLIDAY_SIDEBAR_KEYWORDS.some((keyword) => lower.includes(keyword))
  ) {
    const hasMainResponsibility = ACADEMIC_RESPONSIBILITY_PATTERN.test(raw);
    const hasMainActivityHint =
      /(semester|admission|selection|mse|ese|submission|meeting|vacation|internship|re-?exam|commencement|festival|gathering)/i.test(
        raw,
      );

    if (hasMainResponsibility || hasMainActivityHint) {
      return false;
    }

    return true;
  }

  if (
    /^\d{1,2}\s+[A-Za-z]{3,12}\s+\d{4}/i.test(raw) &&
    /\(.*\)/.test(raw) &&
    !ACADEMIC_RESPONSIBILITY_PATTERN.test(raw)
  ) {
    return true;
  }

  return false;
};

export const extractAcademicDateTokens = (value: any = "") => {
  const raw = String(value || "");
  return Array.from(
    raw.matchAll(/\d{1,2}\s+[A-Za-z]{3,12}\s+\d{4}(?:\s*\([^)]*\))?/gi),
  )
    .map((match) => String(match[0] || "").trim())
    .filter(Boolean);
};

export const extractAcademicHolidayName = (value: any = "") => {
  const raw = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";

  const bracket = raw.match(/\(([^)]+)\)/);
  if (bracket?.[1] && ACADEMIC_HOLIDAY_NAME_HINT_PATTERN.test(bracket[1])) {
    return String(bracket[1]).trim();
  }

  const withoutDate = raw
    .replace(/\d{1,2}\s+[A-Za-z]{3,12}\s+\d{4}/i, "")
    .replace(/[()]/g, "")
    .replace(/^[\s:,-]+|[\s:,-]+$/g, "")
    .trim();
  if (withoutDate) {
    return withoutDate;
  }

  return "Public Holiday";
};

export const normalizeAcademicRescheduledDate = (value: any = "") => {
  const raw = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw || /^[-–—_]{2,}$/.test(raw)) {
    return "";
  }

  return raw;
};

export const buildAcademicHolidayEntry = ({
  holidayCell = "",
  rescheduledCell = "",
  sourceLine = "",
}: any) => {
  const holidayRaw = String(holidayCell || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!holidayRaw) {
    return null;
  }

  const holidayTokens = extractAcademicDateTokens(holidayRaw);
  const holidayToken = holidayTokens[0] || "";
  const startDate = parseAcademicDateValue(holidayToken || holidayRaw);
  const holidayName = extractAcademicHolidayName(holidayRaw);

  if (!holidayName || !startDate) {
    return null;
  }

  const dateSlots =
    holidayToken
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim() || holidayRaw;

  const rescheduled = normalizeAcademicRescheduledDate(rescheduledCell);

  return {
    activity: holidayName,
    dateSlots,
    startDate,
    endDate: startDate,
    responsibility: rescheduled ? `Rescheduled: ${rescheduled}` : "--",
    rescheduledDateForAcademics: rescheduled,
    category: "holiday",
    color: "green",
    icon: "umbrella",
    sourceLine,
    validationErrors: [],
  };
};

export const parseAcademicHolidaysFromCsv = (csvText: any) => {
  const lines = csvText
    .split(/\r?\n/)
    .map((line: any) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const delimiter = lines[0].includes(";")
    ? ";"
    : lines[0].includes("\t")
      ? "\t"
      : ",";

  const headers = parseCsvLine(lines[0], delimiter).map((header: any) =>
    String(header || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .trim(),
  );

  const holidayIndex = headers.findIndex(
    (header: any) =>
      header === "publicholidays" ||
      header === "publicholiday" ||
      header === "holiday" ||
      header.includes("publicholidays"),
  );
  const rescheduledIndex = headers.findIndex(
    (header: any) =>
      header === "rescheduleddateforacademics" ||
      header === "rescheduleddate" ||
      header.includes("rescheduled"),
  );

  const parsed: any[] = [];
  const seen = new Set();

  for (let i = 1; i < lines.length; i += 1) {
    const columns = parseCsvLine(lines[i], delimiter);
    const holidayCell =
      holidayIndex >= 0 ? String(columns[holidayIndex] || "").trim() : "";
    const rescheduledCell =
      rescheduledIndex >= 0
        ? String(columns[rescheduledIndex] || "").trim()
        : "";

    const fallbackHolidayCell =
      !holidayCell && columns.length >= 1
        ? String(columns[0] || "").trim()
        : holidayCell;

    const entry = buildAcademicHolidayEntry({
      holidayCell: fallbackHolidayCell,
      rescheduledCell,
      sourceLine: lines[i],
    });

    if (!entry) {
      continue;
    }

    const key = `${entry.activity.toLowerCase()}|${entry.startDate}|${String(
      entry.rescheduledDateForAcademics || "",
    ).toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    parsed.push(entry);
  }

  return parsed;
};

export const parseAcademicHolidaysFromText = (text: any) => {
  const lines = text
    .split(/\r?\n/)
    .map((line: any) =>
      String(line || "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);

  const parsed: any[] = [];
  const seen = new Set();
  let inHolidaySection = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (lower.includes("important points to be noted")) {
      inHolidaySection = false;
      break;
    }

    if (
      lower.includes("public holidays") ||
      lower.includes("rescheduled date for academics")
    ) {
      inHolidaySection = true;
      continue;
    }

    const dateTokens = extractAcademicDateTokens(line);
    if (!dateTokens.length) {
      continue;
    }

    const looksHolidayRow =
      inHolidaySection || ACADEMIC_HOLIDAY_NAME_HINT_PATTERN.test(lower);
    if (!looksHolidayRow) {
      continue;
    }

    let holidayCell = "";
    let rescheduledCell = "";

    const tableSplit = line
      .split(/\||\t+/)
      .map((part: any) => part.trim())
      .filter(Boolean);

    if (tableSplit.length >= 2) {
      holidayCell = tableSplit[0] || "";
      rescheduledCell = tableSplit.slice(1).join(" ");
    } else {
      holidayCell = dateTokens[0] || "";
      if (dateTokens.length >= 2) {
        rescheduledCell = dateTokens[1];
      } else if (/^[-–—_]{2,}$/.test(line)) {
        rescheduledCell = "--";
      } else {
        const nextLine = String(lines[i + 1] || "").trim();
        if (
          nextLine &&
          (ACADEMIC_RESCHEDULE_HINT_PATTERN.test(nextLine) ||
            /^[-–—_]{2,}$/.test(nextLine))
        ) {
          rescheduledCell = nextLine;
          i += 1;
        }
      }
    }

    const entry = buildAcademicHolidayEntry({
      holidayCell,
      rescheduledCell,
      sourceLine: line,
    });

    if (!entry) {
      continue;
    }

    const key = `${entry.activity.toLowerCase()}|${entry.startDate}|${String(
      entry.rescheduledDateForAcademics || "",
    ).toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    parsed.push(entry);
  }

  return parsed;
};

export const parseAcademicCalendarFromCsv = (csvText: any) => {
  const lines = csvText
    .split(/\r?\n/)
    .map((line: any) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const delimiter = lines[0].includes(";")
    ? ";"
    : lines[0].includes("\t")
      ? "\t"
      : ",";
  const headers = parseCsvLine(lines[0], delimiter).map((header: any) =>
    header.toLowerCase().replace(/\s+/g, "").trim(),
  );

  const idx = {
    activity: headers.findIndex(
      (h: any) => h === "activity" || h === "title" || h === "event",
    ),
    dateSlots: headers.findIndex(
      (h: any) => h === "dateslots" || h === "date" || h === "dates",
    ),
    startDate: headers.findIndex((h: any) => h === "startdate" || h === "fromdate"),
    endDate: headers.findIndex((h: any) => h === "enddate" || h === "todate"),
    responsibility: headers.findIndex(
      (h: any) => h === "responsibility" || h === "owner",
    ),
    category: headers.findIndex((h: any) => h === "category" || h === "type"),
    color: headers.findIndex((h: any) => h === "color"),
    icon: headers.findIndex((h: any) => h === "icon"),
  };

  const parsed: any[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const columns = parseCsvLine(lines[i], delimiter);
    const activity =
      idx.activity >= 0 ? String(columns[idx.activity] || "").trim() : "";
    const dateSlots =
      idx.dateSlots >= 0 ? String(columns[idx.dateSlots] || "").trim() : "";
    const responsibility =
      idx.responsibility >= 0
        ? String(columns[idx.responsibility] || "").trim()
        : "";

    if (!activity && !dateSlots) {
      continue;
    }

    if (
      isAcademicHolidaySidebarLine(`${activity} ${dateSlots} ${responsibility}`)
    ) {
      continue;
    }

    const rangeFromSlots = resolveAcademicDateRange(dateSlots);
    const startDateRaw =
      idx.startDate >= 0 ? String(columns[idx.startDate] || "").trim() : "";
    const endDateRaw =
      idx.endDate >= 0 ? String(columns[idx.endDate] || "").trim() : "";

    const startDate =
      parseAcademicDateValue(startDateRaw) || rangeFromSlots.startDate;
    const endDate =
      parseAcademicDateValue(endDateRaw) || rangeFromSlots.endDate;

    const category = normalizeAcademicCalendarCategory(
      idx.category >= 0 ? columns[idx.category] : "",
      activity,
    );
    const color =
      idx.color >= 0
        ? String(columns[idx.color] || "")
            .trim()
            .toLowerCase()
        : "";
    const icon =
      idx.icon >= 0
        ? String(columns[idx.icon] || "")
            .trim()
            .toLowerCase()
        : "";

    const normalizedResponsibility = normalizeAcademicResponsibility(
      responsibility || "--",
    );

    parsed.push({
      activity,
      dateSlots,
      startDate,
      endDate: endDate || startDate,
      responsibility: normalizedResponsibility,
      category,
      color: color || getAcademicColorByCategory(category),
      icon: icon || getAcademicIconByCategory(category),
      sourceLine: lines[i],
      validationErrors: [
        ...(!activity ? ["Missing activity"] : []),
        ...(!dateSlots ? ["Missing date slots"] : []),
        ...(!startDate ? ["Unable to parse start date"] : []),
      ],
    });
  }

  return parsed;
};

export const parseAcademicCalendarFromText = (text: any) => {
  const lines = text
    .split(/\r?\n/)
    .map((line: any) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const parsed: any[] = [];
  const seen = new Set();
  let pendingActivity = "";

  for (const line of lines) {
    if (isAcademicHolidaySidebarLine(line)) {
      pendingActivity = "";
      continue;
    }

    const lower = line.toLowerCase();
    if (
      lower.includes("activity") &&
      lower.includes("date") &&
      lower.includes("respons")
    ) {
      continue;
    }

    let activity = "";
    let dateSlots = "";
    let responsibility = "--";

    const tableSplit = line
      .split(/\||\t+/)
      .map((part: any) => part.trim())
      .filter(Boolean);

    if (tableSplit.length >= 3) {
      activity = tableSplit[0] || "";
      dateSlots = tableSplit[1] || "";
      responsibility = normalizeAcademicResponsibility(
        tableSplit.slice(2).join(" "),
      );
    } else {
      const dateMatch = line.match(ACADEMIC_ROW_DATE_SEGMENT_PATTERN);
      if (!dateMatch) {
        if (!ACADEMIC_RESPONSIBILITY_PATTERN.test(line) && line.length >= 18) {
          pendingActivity = `${pendingActivity} ${line}`.trim();
        }
        continue;
      }

      dateSlots = String(dateMatch[1] || "").trim();
      const splitIndex = line.indexOf(dateSlots);
      const left = line
        .slice(0, splitIndex)
        .replace(/[\s:,-]+$/, "")
        .trim();
      const right = line
        .slice(splitIndex + dateSlots.length)
        .replace(/^[\s:,-]+/, "")
        .trim();

      activity = left || "";
      responsibility = normalizeAcademicResponsibility(right || "--");
    }

    activity = activity.replace(/^\d+[.)-]\s*/, "").trim();

    if (!activity && pendingActivity) {
      activity = pendingActivity;
    } else if (pendingActivity) {
      const looksLikeWrappedContinuation =
        activity.length < 70 || /^[a-z(]/.test(activity);
      if (looksLikeWrappedContinuation) {
        activity = `${pendingActivity} ${activity}`.replace(/\s+/g, " ").trim();
      }
    }
    pendingActivity = "";

    if (!activity && !dateSlots) {
      continue;
    }

    if (
      isAcademicHolidaySidebarLine(`${activity} ${dateSlots} ${responsibility}`)
    ) {
      continue;
    }

    if (/^\d{1,2}\s+[A-Za-z]{3,12}\s+\d{4}/i.test(activity)) {
      continue;
    }

    const range = resolveAcademicDateRange(dateSlots);
    const category = normalizeAcademicCalendarCategory("", activity);
    const normalizedResponsibility =
      normalizeAcademicResponsibility(responsibility);

    const key = `${activity.toLowerCase()}|${range.startDate}|${range.endDate}|${normalizedResponsibility.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    parsed.push({
      activity,
      dateSlots,
      startDate: range.startDate,
      endDate: range.endDate || range.startDate,
      responsibility: normalizedResponsibility,
      category,
      color: getAcademicColorByCategory(category),
      icon: getAcademicIconByCategory(category),
      sourceLine: line,
      validationErrors: [
        ...(!activity ? ["Missing activity"] : []),
        ...(!dateSlots ? ["Missing date slots"] : []),
        ...(!range.startDate ? ["Unable to parse start date"] : []),
      ],
    });
  }

  return parsed;
};
