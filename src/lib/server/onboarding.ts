// Student onboarding parsers — ported verbatim from the legacy monolith
// (backend/server.js).
import {
  BRANCHES,
  normalizeBranch,
  normalizePhone,
  normalizeSemester,
  normalizeYear,
} from "@/lib/server/constants";
import { getPrnFromRecord } from "@/lib/server/utils";
import { parseCsvLine } from "@/lib/server/file-text";

export const parseStudentsFromCsv = (csvText: any) => {
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
  const headers = parseCsvLine(lines[0], delimiter).map((h: any) =>
    h.toLowerCase().replace(/\s+/g, "").trim(),
  );

  const idx = {
    name: headers.findIndex((h: any) => h === "name" || h === "studentname"),
    prn: headers.findIndex(
      (h: any) => h === "prn" || h === "rollno" || h === "rollnumber",
    ),
    phone: headers.findIndex(
      (h: any) =>
        h === "mobile" ||
        h === "mobileno" ||
        h === "phone" ||
        h === "phonenumber",
    ),
    branch: headers.findIndex(
      (h: any) => h === "branch" || h === "department" || h === "dept",
    ),
    year: headers.findIndex((h: any) => h === "year" || h === "academicyear"),
    semester: headers.findIndex(
      (h: any) => h === "semester" || h === "sem" || h === "term",
    ),
    email: headers.findIndex((h: any) => h === "email" || h === "contactemail"),
  };

  const parsed: any[] = [];
  const seenPrn = new Set();

  for (let i = 1; i < lines.length; i += 1) {
    const columns = parseCsvLine(lines[i], delimiter);
    const name = idx.name >= 0 ? String(columns[idx.name] || "").trim() : "";
    const prn =
      idx.prn >= 0
        ? String(columns[idx.prn] || "")
            .trim()
            .toUpperCase()
        : "";
    const phone =
      idx.phone >= 0 ? normalizePhone(columns[idx.phone] || "") : "";
    const branch =
      idx.branch >= 0 ? normalizeBranch(columns[idx.branch] || "") : "";
    const year = idx.year >= 0 ? normalizeYear(columns[idx.year] || "") : "";
    const semester =
      idx.semester >= 0 ? normalizeSemester(columns[idx.semester] || "") : "";
    const email =
      idx.email >= 0
        ? String(columns[idx.email] || "")
            .trim()
            .toLowerCase()
        : "";

    const validationErrors: any[] = [];
    if (!name) validationErrors.push("Missing name");
    if (!prn) validationErrors.push("Missing PRN");
    if (!phone) validationErrors.push("Missing/invalid phone");
    if (!branch) validationErrors.push("Missing/invalid branch");
    if (!year) validationErrors.push("Missing/invalid year");
    if (!semester) validationErrors.push("Missing/invalid semester");
    if (prn && seenPrn.has(prn)) validationErrors.push("Duplicate PRN in file");

    if (prn) {
      seenPrn.add(prn);
    }

    parsed.push({
      name,
      prn,
      phone,
      branch,
      year,
      semester,
      email,
      sourceLine: lines[i],
      validationErrors,
    });
  }

  return parsed;
};

export const parseStudentsFromText = (text: any) => {
  const lines = text
    .split(/\r?\n/)
    .map((l: any) => l.trim())
    .filter(Boolean);

  const parsed: any[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes("name") &&
      lower.includes("prn") &&
      (lower.includes("mobile") || lower.includes("phone"))
    ) {
      continue;
    }

    const phoneMatch = line.match(/\b\d{10}\b/);
    const prnMatch = line.match(/\b[A-Za-z0-9]{8,20}\b/);
    const emailMatch = line.match(
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    );

    const yearMatch = line.match(
      /\b(1st|2nd|3rd|4th|first|second|third|fourth|1|2|3|4)\b/i,
    );
    const semesterMatch = line.match(
      /\b(sem(?:ester)?\s*[12]|[12](?:st|nd)?\s*sem(?:ester)?)\b/i,
    );

    const detectedBranch = BRANCHES.find((b: any) =>
      lower.includes(b.toLowerCase()),
    );

    if (!phoneMatch && !prnMatch && !detectedBranch) {
      continue;
    }

    const branch = detectedBranch || normalizeBranch(line);
    const year = normalizeYear(yearMatch ? yearMatch[1] : "");
    const semester = normalizeSemester(semesterMatch ? semesterMatch[0] : "");
    const phone = normalizePhone(phoneMatch ? phoneMatch[0] : "");
    const prn = (prnMatch ? prnMatch[0] : "").toUpperCase();

    let name = line;
    if (prn) name = name.replace(prn, " ");
    if (phone) name = name.replace(phone, " ");
    if (yearMatch) name = name.replace(yearMatch[0], " ");
    if (semesterMatch) name = name.replace(semesterMatch[0], " ");
    if (branch) name = name.replace(branch, " ");
    if (emailMatch) name = name.replace(emailMatch[0], " ");
    name = name.replace(/\s{2,}/g, " ").trim();

    parsed.push({
      name,
      prn,
      phone,
      branch,
      year,
      semester,
      email: emailMatch ? emailMatch[0].toLowerCase() : "",
      sourceLine: line,
    });
  }

  const seenPrn = new Set();
  return parsed.map((entry: any) => {
    const validationErrors: any[] = [];
    if (!entry.name) validationErrors.push("Missing name");
    if (!entry.prn) validationErrors.push("Missing PRN");
    if (!entry.phone) validationErrors.push("Missing/invalid phone");
    if (!entry.branch) validationErrors.push("Missing/invalid branch");
    if (!entry.year) validationErrors.push("Missing/invalid year");
    if (!entry.semester) validationErrors.push("Missing/invalid semester");

    if (entry.prn) {
      if (seenPrn.has(entry.prn)) {
        validationErrors.push("Duplicate PRN in file");
      }
      seenPrn.add(entry.prn);
    }

    return {
      ...entry,
      validationErrors,
    };
  });
};

export const buildExistingStudentIndex = async (firestore: any) => {
  const usersSnapshot = await firestore.collection("users").get();
  const studentsSnapshot = await firestore.collection("students").get();

  const byPrn = new Map();

  usersSnapshot.docs.forEach((docSnap: any) => {
    const data = docSnap.data();
    const prn = getPrnFromRecord(data);
    if (!prn) return;

    const current = byPrn.get(prn) || { prn };
    byPrn.set(prn, {
      ...current,
      uid: current.uid || data.uid || docSnap.id,
      email: current.email || data.email || "",
      userDocId: docSnap.id,
    });
  });

  studentsSnapshot.docs.forEach((docSnap: any) => {
    const data = docSnap.data();
    const prn = getPrnFromRecord(data);
    if (!prn) return;

    const current = byPrn.get(prn) || { prn };
    byPrn.set(prn, {
      ...current,
      uid: current.uid || data.uid || docSnap.id,
      email: current.email || data.email || "",
      studentDocId: docSnap.id,
    });
  });

  return byPrn;
};
