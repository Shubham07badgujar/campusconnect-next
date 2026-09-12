"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  FiUpload,
  FiTrash2,
  FiSave,
  FiEdit2,
  FiPlus,
  FiX,
  FiFileText,
  FiAlertCircle,
  FiCheck,
  FiEye,
  FiRefreshCw,
} from "react-icons/fi";
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/client/firebase";
import Button from "@/components/ui/Button";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import { Field, Input, Select } from "@/components/ui/Field";
import Modal from "@/components/ui/Modal";
import {
  TableWrap,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/Table";
import Tabs from "@/components/ui/Tabs";
import { PageLoader, EmptyState } from "@/components/ui/States";

const API_URL = String("")
  .trim()
  .replace(/\/+$/, "");

const GEMINI_API_KEY = String("").trim();

const buildRequestError = (response, rawText = "") => {
  const text = String(rawText || "").trim();
  if (text.startsWith("<")) {
    return `Server returned HTML instead of JSON (HTTP ${response.status}). Check VITE_API_URL and backend deployment.`;
  }

  return (
    text ||
    `Request failed with status ${response.status}${response.statusText ? ` (${response.statusText})` : ""}.`
  );
};

const parseJsonResponse = async (response) => {
  const rawText = await response.text();
  let data: any = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(buildRequestError(response, rawText));
    }
  }

  if (!response.ok) {
    throw new Error(data.message || buildRequestError(response, rawText));
  }

  return data;
};

const fetchWithNetworkHint = async (url, options) => {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(
      `Unable to reach backend at ${API_URL}. Check deployment env VITE_API_URL and backend availability.`,
    );
  }
};

const YEARS = ["1st", "2nd", "3rd", "4th"];
const BRANCH_OPTIONS = [
  "Civil",
  "Computer",
  "Electrical",
  "E&TC",
  "Instrumentation",
  "Mechanical",
  "Information Technology",
];

const DAY_PATTERN =
  /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i;
const DATE_PATTERN = /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/;
const TIME_PATTERN =
  /(\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:to|-|–)\s*\d{1,2}:\d{2}\s*(?:am|pm)?)/i;
const COURSE_PATTERN = /^([A-Z]{2,4}\s?\d{3,4}[A-Z]{0,2})\s*[-–—:]\s*(.+)$/i;
const COURSE_SPLIT_PATTERN = /(?=[A-Z]{2,4}\s?\d{3,4}[A-Z]{0,2}\s*[-–—:])/g;
const BRANCH_PREFIX_PATTERN =
  /^(Civil|Computer|Electrical|E\s*&\s*T\s*&\s*C|E&TC|Instrumentation|Mechanical|Information\s+Technology|IT)\b\s*(.*)$/i;

const normalizeYearToken = (value = "") =>
  String(value || "").replace(/[^0-9]/g, "");

const parseExamDate = (dateStr = "") => {
  const raw = String(dateStr || "").trim();
  if (!raw) {
    return null;
  }

  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]) - 1;
    const year = Number(dmy[3]);
    return new Date(year < 100 ? 2000 + year : year, month, day);
  }

  const iso = raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeDateString = (rawDate = "") => {
  const parsed = parseExamDate(rawDate);
  if (!parsed) {
    return String(rawDate || "").trim();
  }
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const yyyy = String(parsed.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
};

const getTimeRangeStartMinutes = (timeRange = "") => {
  const token = String(timeRange || "")
    .trim()
    .match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);

  if (!token) {
    return Number.POSITIVE_INFINITY;
  }

  let hours = Number.parseInt(token[1], 10);
  const minutes = Number.parseInt(token[2], 10);
  const meridiem = String(token[3] || "").toLowerCase();

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return Number.POSITIVE_INFINITY;
  }

  if (meridiem === "pm" && hours < 12) {
    hours += 12;
  } else if (meridiem === "am" && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
};

const normalizeBranchName = (branchRaw = "") => {
  const value = String(branchRaw || "")
    .trim()
    .toLowerCase();

  if (!value) return "";
  if (value === "it" || value.includes("information"))
    return "Information Technology";
  if (value.includes("civil")) return "Civil";
  if (value.includes("computer")) return "Computer";
  if (value.includes("electrical")) return "Electrical";
  if (value.includes("instrument")) return "Instrumentation";
  if (value.includes("mechanical")) return "Mechanical";
  if (
    value.includes("e&tc") ||
    value.includes("entc") ||
    value.includes("electronics")
  ) {
    return "E&TC";
  }

  return branchRaw;
};

const getWeekdayFromDate = (rawDate = "") => {
  const parsed = parseExamDate(rawDate);
  if (!parsed) {
    return "";
  }
  return parsed.toLocaleDateString("en-US", { weekday: "long" });
};

const parseTimetableText = (text = "", selectedYear = "4th") => {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const exams = [];
  let currentDay = "";
  let currentDate = "";
  let currentTime = "";
  let currentBranch = "";

  lines.forEach((line) => {
    const dayMatch = line.match(DAY_PATTERN);
    const dateMatch = line.match(DATE_PATTERN);
    const timeMatch = line.match(TIME_PATTERN);

    if (dayMatch || dateMatch || timeMatch) {
      if (dayMatch) {
        currentDay = dayMatch[1];
      }
      if (dateMatch) {
        currentDate = normalizeDateString(dateMatch[1]);
      }
      if (timeMatch) {
        currentTime = timeMatch[1].replace(/\s+/g, " ").trim();
      }

      if (dateMatch || timeMatch) {
        currentBranch = "";
      }

      if (!line.match(/[A-Z]{2,4}\s?\d{3,4}[A-Z]{0,2}\s*[-–—:]/)) {
        return;
      }
    }

    let remaining = line;
    const branchMatch = line.match(BRANCH_PREFIX_PATTERN);
    if (branchMatch) {
      currentBranch = normalizeBranchName(branchMatch[1]);
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
      .split(COURSE_SPLIT_PATTERN)
      .map((segment) => segment.trim())
      .filter(Boolean);

    courseSegments.forEach((segment) => {
      const courseMatch = segment.match(COURSE_PATTERN);
      if (!courseMatch) {
        return;
      }

      const code = String(courseMatch[1] || "")
        .replace(/\s+/g, "")
        .toUpperCase();
      const name = String(courseMatch[2] || "").trim();
      if (!code || !name) {
        return;
      }

      exams.push({
        day: currentDay || getWeekdayFromDate(currentDate),
        date: currentDate,
        time: currentTime,
        branch: currentBranch,
        courseCode: code,
        courseName: name,
        duration: "3 hours",
        year: selectedYear,
      });
    });
  });

  const deduped = [];
  const seen = new Set();

  exams.forEach((exam) => {
    const key = [
      String(exam.date || "").trim(),
      String(exam.time || "").trim(),
      String(exam.branch || "")
        .trim()
        .toLowerCase(),
      String(exam.courseCode || "")
        .trim()
        .toUpperCase(),
    ].join("|");

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    deduped.push(exam);
  });

  return deduped;
};

const normalizeExamRows = (rows = [], selectedYear = "4th") => {
  if (!Array.isArray(rows)) {
    return [];
  }

  const deduped = [];
  const seen = new Set();

  rows.forEach((item) => {
    const row = item && typeof item === "object" ? item : {};

    const date = normalizeDateString(row.date || row.examDate || "");
    const time = String(row.time || row.slot || row.examTime || "")
      .replace(/\s+/g, " ")
      .trim();
    const branch = normalizeBranchName(row.branch || row.department || "");
    const courseCode = String(
      row.courseCode || row.code || row.subjectCode || "",
    )
      .replace(/\s+/g, "")
      .toUpperCase()
      .trim();
    const courseName = String(
      row.courseName || row.subjectName || row.subject || row.course || "",
    )
      .replace(/\s+/g, " ")
      .trim();
    const day = String(row.day || row.weekday || "").trim();

    if (!date || !time || !courseCode || !courseName) {
      return;
    }

    const key = [
      String(date).trim(),
      String(time).trim(),
      String(branch || "")
        .trim()
        .toLowerCase(),
      String(courseCode).trim().toUpperCase(),
    ].join("|");

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    deduped.push({
      day: day || getWeekdayFromDate(date),
      date,
      time,
      branch,
      courseCode,
      courseName,
      duration: String(row.duration || "3 hours").trim() || "3 hours",
      year: selectedYear,
    });
  });

  return deduped;
};

export default function ExamTimetableManagement() {
  const [activeTab, setActiveTab] = useState("upload");
  const [selectedYear, setSelectedYear] = useState("4th");

  const [ocrFile, setOcrFile] = useState(null);
  const [ocrUploading, setOcrUploading] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [parsedExams, setParsedExams] = useState([]);

  const [existingExams, setExistingExams] = useState([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [selectedExamIds, setSelectedExamIds] = useState([]);

  const [editingExam, setEditingExam] = useState(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const [manualExam, setManualExam] = useState({
    day: "",
    date: "",
    time: "",
    branch: "Computer",
    courseCode: "",
    courseName: "",
    duration: "3 hours",
  });

  const [pdfFile, setPdfFile] = useState(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [uploadedPdfs, setUploadedPdfs] = useState([]);

  const [message, setMessage] = useState({ type: "", text: "" });

  const activePdf = useMemo(
    () =>
      uploadedPdfs.find((item) => item.active !== false) ||
      uploadedPdfs[0] ||
      null,
    [uploadedPdfs],
  );

  const parsedPreviewByBranch = useMemo(() => {
    if (!Array.isArray(parsedExams) || parsedExams.length === 0) {
      return [];
    }

    const branchOrder = new Map(
      BRANCH_OPTIONS.map((branch, index) => [branch, index]),
    );

    const grouped = new Map();
    parsedExams.forEach((exam) => {
      const normalizedBranch = normalizeBranchName(exam.branch || "");
      const branch = normalizedBranch || "Unassigned";

      if (!grouped.has(branch)) {
        grouped.set(branch, []);
      }
      grouped.get(branch).push(exam);
    });

    return Array.from(grouped.entries())
      .map(([branch, rows]) => {
        const sortedRows = [...rows].sort((left, right) => {
          const leftDate = parseExamDate(left.date || "");
          const rightDate = parseExamDate(right.date || "");

          const leftDateMs = leftDate
            ? leftDate.getTime()
            : Number.POSITIVE_INFINITY;
          const rightDateMs = rightDate
            ? rightDate.getTime()
            : Number.POSITIVE_INFINITY;

          if (leftDateMs !== rightDateMs) {
            return leftDateMs - rightDateMs;
          }

          const leftTime = getTimeRangeStartMinutes(left.time || "");
          const rightTime = getTimeRangeStartMinutes(right.time || "");
          if (leftTime !== rightTime) {
            return leftTime - rightTime;
          }

          return String(left.courseCode || "").localeCompare(
            String(right.courseCode || ""),
          );
        });

        return {
          branch,
          rows: sortedRows,
        };
      })
      .sort((left, right) => {
        const leftOrder = branchOrder.has(left.branch)
          ? branchOrder.get(left.branch)
          : Number.POSITIVE_INFINITY;
        const rightOrder = branchOrder.has(right.branch)
          ? branchOrder.get(right.branch)
          : Number.POSITIVE_INFINITY;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.branch.localeCompare(right.branch);
      });
  }, [parsedExams]);

  useEffect(() => {
    fetchExistingExams();
    fetchUploadedPdfs();
  }, [selectedYear]);

  const fetchExistingExams = async () => {
    setLoadingExams(true);
    try {
      const snapshot = await getDocs(collection(db, "examTimetable"));
      const yearToken = normalizeYearToken(selectedYear);

      const rows = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
        .filter((exam) => {
          if (exam?.isActive === false) {
            return false;
          }
          return normalizeYearToken(exam?.year) === yearToken;
        })
        .sort((a, b) => {
          const dateA = parseExamDate(a.date || "");
          const dateB = parseExamDate(b.date || "");
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;

          const dateDiff = dateA.getTime() - dateB.getTime();
          if (dateDiff !== 0) return dateDiff;

          return String(a.time || "").localeCompare(String(b.time || ""));
        });

      setExistingExams(rows);
      setSelectedExamIds((prev) =>
        prev.filter((selectedId) => rows.some((row) => row.id === selectedId)),
      );
    } catch (error) {
      console.error("Error fetching exam timetable:", error);
      setMessage({ type: "error", text: "Failed to fetch exam timetable." });
    } finally {
      setLoadingExams(false);
    }
  };

  const fetchUploadedPdfs = async () => {
    try {
      const snapshot = await getDocs(collection(db, "exam_timetable_files"));
      const yearToken = normalizeYearToken(selectedYear);

      const rows = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
        .filter((item) => normalizeYearToken(item.year) === yearToken)
        .sort((a, b) => {
          const aMs = Number(a.createdAt?.seconds || 0);
          const bMs = Number(b.createdAt?.seconds || 0);
          return bMs - aMs;
        });

      setUploadedPdfs(rows);
    } catch (error) {
      console.error("Error fetching uploaded timetable PDFs:", error);
    }
  };

  const handleOcrFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    if (selected && selected.size > 10 * 1024 * 1024) {
      setMessage({
        type: "error",
        text: "File exceeds 10MB upload limit. Please upload a smaller PDF/image.",
      });
      setOcrFile(null);
      setExtractedText("");
      setParsedExams([]);
      return;
    }

    setOcrFile(selected);
    setExtractedText("");
    setParsedExams([]);
  };

  const handleUploadAndExtract = async () => {
    if (!ocrFile) {
      setMessage({
        type: "error",
        text: "Please choose a PDF/image file first.",
      });
      return;
    }

    setOcrUploading(true);
    setMessage({ type: "", text: "" });

    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();
      const formData = new FormData();
      formData.append("file", ocrFile);
      formData.append("year", selectedYear);

      const requestHeaders = {
        Authorization: `Bearer ${token}`,
      };
      if (GEMINI_API_KEY) {
        requestHeaders["x-gemini-api-key"] = GEMINI_API_KEY;
      }

      const response = await fetchWithNetworkHint(
        `${API_URL}/api/upload-exam-timetable`,
        {
          method: "POST",
          headers: requestHeaders,
          body: formData,
        },
      );

      const data = await parseJsonResponse(response);

      const rawText = String(data.extractedText || "");
      setExtractedText(rawText);

      const backendRows = Array.isArray(data.parsedExams)
        ? data.parsedExams
        : [];
      const rows =
        backendRows.length > 0
          ? normalizeExamRows(backendRows, selectedYear)
          : parseTimetableText(rawText, selectedYear);
      setParsedExams(rows);

      const parserLabel =
        data.structuredBy === "gemini"
          ? "Gemini"
          : backendRows.length > 0
            ? "Server parser"
            : "Local parser";

      setMessage({
        type: "success",
        text:
          rows.length > 0
            ? `OCR complete (${parserLabel}). Parsed ${rows.length} exam rows.`
            : "OCR complete. No structured rows parsed automatically; please edit/add rows manually.",
      });
    } catch (error) {
      console.error("OCR upload error:", error);
      setMessage({
        type: "error",
        text: error.message || "OCR upload failed.",
      });
    } finally {
      setOcrUploading(false);
    }
  };

  const updateParsedExam = (index, field, value) => {
    setParsedExams((prev) => {
      const clone = [...prev];
      clone[index] = { ...clone[index], [field]: value };
      return clone;
    });
  };

  const removeParsedExam = (index) => {
    setParsedExams((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const addEmptyParsedExam = () => {
    setParsedExams((prev) => [
      ...prev,
      {
        day: "",
        date: "",
        time: "",
        branch: "Computer",
        courseCode: "",
        courseName: "",
        duration: "3 hours",
        year: selectedYear,
      },
    ]);
  };

  const handleSaveParsedExams = async () => {
    if (parsedExams.length === 0) {
      setMessage({ type: "error", text: "No parsed exams to save." });
      return;
    }

    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();

      const payload = {
        year: selectedYear,
        replaceExisting: true,
        exams: parsedExams.map((exam) => ({
          day: String(exam.day || "").trim() || getWeekdayFromDate(exam.date),
          date: normalizeDateString(exam.date || ""),
          time: String(exam.time || "").trim(),
          branch: normalizeBranchName(exam.branch || ""),
          courseCode: String(exam.courseCode || "")
            .replace(/\s+/g, "")
            .toUpperCase(),
          courseName: String(exam.courseName || "").trim(),
          duration: String(exam.duration || "3 hours").trim(),
          year: selectedYear,
          sourceType: "ocr",
        })),
      };

      const response = await fetchWithNetworkHint(
        `${API_URL}/api/save-exam-timetable`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      const data = await parseJsonResponse(response);

      setMessage({
        type: "success",
        text:
          data.message ||
          `Saved ${data.savedCount || 0} exam rows successfully.`,
      });
      setParsedExams([]);
      setExtractedText("");
      setOcrFile(null);
      await fetchExistingExams();
    } catch (error) {
      console.error("Save OCR exams error:", error);
      setMessage({ type: "error", text: error.message || "Save failed." });
    }
  };

  const handleClearYearExams = async () => {
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();

      const response = await fetchWithNetworkHint(
        `${API_URL}/api/clear-exam-timetable`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ year: selectedYear }),
        },
      );

      const data = await parseJsonResponse(response);

      setMessage({
        type: "success",
        text: data.message || `Cleared ${data.deletedCount || 0} records.`,
      });
      setShowConfirmClear(false);
      await fetchExistingExams();
    } catch (error) {
      console.error("Clear year timetable error:", error);
      setMessage({ type: "error", text: error.message || "Clear failed." });
    }
  };

  const handleRemoveDuplicates = async () => {
    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();

      const response = await fetchWithNetworkHint(
        `${API_URL}/api/remove-duplicate-exams`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await parseJsonResponse(response);

      setMessage({
        type: "success",
        text: data.message || "Duplicate cleanup complete.",
      });
      await fetchExistingExams();
    } catch (error) {
      console.error("Remove duplicates error:", error);
      setMessage({
        type: "error",
        text: error.message || "Duplicate cleanup failed.",
      });
    }
  };

  const handleAddManualExam = async () => {
    const required = [
      manualExam.date,
      manualExam.time,
      manualExam.branch,
      manualExam.courseCode,
      manualExam.courseName,
    ].every((field) => String(field || "").trim().length > 0);

    if (!required) {
      setMessage({
        type: "error",
        text: "Please fill all required manual fields.",
      });
      return;
    }

    try {
      await addDoc(collection(db, "examTimetable"), {
        day:
          String(manualExam.day || "").trim() ||
          getWeekdayFromDate(manualExam.date),
        date: normalizeDateString(manualExam.date),
        time: String(manualExam.time || "").trim(),
        branch: normalizeBranchName(manualExam.branch),
        courseCode: String(manualExam.courseCode || "")
          .replace(/\s+/g, "")
          .toUpperCase(),
        courseName: String(manualExam.courseName || "").trim(),
        duration: String(manualExam.duration || "3 hours").trim(),
        year: selectedYear,
        isActive: true,
        sourceType: "manual",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setMessage({
        type: "success",
        text: "Manual exam row added successfully.",
      });
      setManualExam({
        day: "",
        date: "",
        time: "",
        branch: "Computer",
        courseCode: "",
        courseName: "",
        duration: "3 hours",
      });
      await fetchExistingExams();
    } catch (error) {
      console.error("Add manual exam error:", error);
      setMessage({
        type: "error",
        text: error.message || "Failed to add manual exam.",
      });
    }
  };

  const handleUpdateExam = async () => {
    if (!editingExam?.id) {
      return;
    }

    try {
      const ref = doc(db, "examTimetable", editingExam.id);
      await updateDoc(ref, {
        day:
          String(editingExam.day || "").trim() ||
          getWeekdayFromDate(editingExam.date),
        date: normalizeDateString(editingExam.date),
        time: String(editingExam.time || "").trim(),
        branch: normalizeBranchName(editingExam.branch || ""),
        courseCode: String(editingExam.courseCode || "")
          .replace(/\s+/g, "")
          .toUpperCase(),
        courseName: String(editingExam.courseName || "").trim(),
        duration: String(editingExam.duration || "3 hours").trim(),
        year: selectedYear,
        isActive: editingExam.isActive === false ? false : true,
        updatedAt: serverTimestamp(),
      });

      setMessage({ type: "success", text: "Exam row updated successfully." });
      setEditingExam(null);
      await fetchExistingExams();
    } catch (error) {
      console.error("Update exam error:", error);
      setMessage({ type: "error", text: error.message || "Update failed." });
    }
  };

  const handleDeleteExam = async (examId) => {
    if (!window.confirm("Delete this exam row permanently?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "examTimetable", examId));
      setSelectedExamIds((prev) =>
        prev.filter((selectedId) => selectedId !== examId),
      );
      if (editingExam?.id === examId) {
        setEditingExam(null);
      }
      setMessage({ type: "success", text: "Exam row deleted successfully." });
      await fetchExistingExams();
    } catch (error) {
      console.error("Delete exam error:", error);
      setMessage({ type: "error", text: error.message || "Delete failed." });
    }
  };

  const toggleExamSelection = (examId) => {
    setSelectedExamIds((prev) =>
      prev.includes(examId)
        ? prev.filter((selectedId) => selectedId !== examId)
        : [...prev, examId],
    );
  };

  const toggleSelectAllExams = () => {
    const allIds = existingExams.map((exam) => exam.id);
    const areAllSelected =
      allIds.length > 0 &&
      allIds.every((examId) => selectedExamIds.includes(examId));

    if (areAllSelected) {
      setSelectedExamIds([]);
      return;
    }

    setSelectedExamIds(allIds);
  };

  const handleDeleteSelectedExams = async () => {
    if (selectedExamIds.length === 0) {
      setMessage({
        type: "error",
        text: "Please select at least one exam row.",
      });
      return;
    }

    const label = selectedExamIds.length === 1 ? "entry" : "entries";
    if (
      !window.confirm(
        `Delete ${selectedExamIds.length} selected exam ${label}?`,
      )
    ) {
      return;
    }

    try {
      const batch = writeBatch(db);
      selectedExamIds.forEach((examId) => {
        batch.delete(doc(db, "examTimetable", examId));
      });
      await batch.commit();

      if (editingExam?.id && selectedExamIds.includes(editingExam.id)) {
        setEditingExam(null);
      }
      setSelectedExamIds([]);
      setMessage({
        type: "success",
        text: `Deleted ${selectedExamIds.length} exam ${label} successfully.`,
      });
      await fetchExistingExams();
    } catch (error) {
      console.error("Bulk delete exams error:", error);
      setMessage({
        type: "error",
        text: error.message || "Bulk delete failed.",
      });
    }
  };

  const handlePdfFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    setPdfFile(selected);
  };

  const handleUploadPdf = async () => {
    if (!pdfFile) {
      setMessage({ type: "error", text: "Please select a PDF file first." });
      return;
    }

    setPdfUploading(true);

    try {
      const auth = getAuth();
      const token = await auth.currentUser.getIdToken();
      const formData = new FormData();
      formData.append("file", pdfFile);
      formData.append("year", selectedYear);

      const response = await fetchWithNetworkHint(
        `${API_URL}/api/upload-exam-timetable-pdf`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      const data = await parseJsonResponse(response);

      setMessage({
        type: "success",
        text: data.message || "Timetable PDF uploaded.",
      });
      setPdfFile(null);
      await fetchUploadedPdfs();
    } catch (error) {
      console.error("Upload exam PDF error:", error);
      setMessage({
        type: "error",
        text: error.message || "PDF upload failed.",
      });
    } finally {
      setPdfUploading(false);
    }
  };

  const selectedExamIdSet = useMemo(
    () => new Set(selectedExamIds),
    [selectedExamIds],
  );

  const allViewRowsSelected =
    existingExams.length > 0 &&
    existingExams.every((exam) => selectedExamIdSet.has(exam.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam Timetable"
        description="Year-wise OCR import, manual rows, and official timetable PDF upload"
      />

      {message.text ? (
        <div
          className={`flex items-start gap-3 rounded-card border px-4 py-3 text-sm animate-fade-up ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : message.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {message.type === "success" ? (
            <FiCheck className="mt-0.5 shrink-0" />
          ) : (
            <FiAlertCircle className="mt-0.5 shrink-0" />
          )}
          <span>{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage({ type: "", text: "" })}
            className="ml-auto text-current"
            aria-label="Dismiss message"
          >
            <FiX />
          </button>
        </div>
      ) : null}

      <Card>
        <CardBody>
          <Field
            label="Select Academic Year Timetable"
            htmlFor="exam-year-select"
          >
            <Select
              id="exam-year-select"
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              className="sm:max-w-xs"
            >
              {YEARS.map((year) => (
                <option key={year} value={year}>
                  {year} Year
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Tabs
        items={[
          {
            value: "upload",
            label: (
              <span className="inline-flex items-center gap-1.5">
                <FiUpload className="h-4 w-4" /> OCR Upload
              </span>
            ),
          },
          {
            value: "manual",
            label: (
              <span className="inline-flex items-center gap-1.5">
                <FiEdit2 className="h-4 w-4" /> Manual Entry
              </span>
            ),
          },
          {
            value: "view",
            label: (
              <span className="inline-flex items-center gap-1.5">
                <FiEye className="h-4 w-4" /> View Exams
              </span>
            ),
            count: existingExams.length,
          },
          {
            value: "pdf",
            label: (
              <span className="inline-flex items-center gap-1.5">
                <FiFileText className="h-4 w-4" /> Upload PDF
              </span>
            ),
          },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "upload" ? (
        <div className="space-y-6 animate-fade-up">
          <Card>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <FiUpload className="h-4 w-4 text-brand-600" /> OCR Upload
                  (Year-Wise Timetable)
                </span>
              }
              description="Upload the complete year timetable (PDF/image). Parser will split branch rows automatically."
            />
            <CardBody>
              <label
                htmlFor="exam-ocr-file"
                className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-line bg-canvas px-6 py-8 text-center transition hover:border-brand-400"
              >
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleOcrFileChange}
                  className="hidden"
                  id="exam-ocr-file"
                />
                <FiUpload className="h-6 w-6 text-brand-500" />
                <p className="text-sm font-medium text-ink">
                  {ocrFile ? ocrFile.name : "Click to select PDF/image"}
                </p>
                <p className="text-xs text-ink-faint">
                  OCR supports scanned timetable images and PDFs.
                </p>
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={handleUploadAndExtract}
                  disabled={!ocrFile || ocrUploading}
                  loading={ocrUploading}
                >
                  {ocrUploading ? "Processing..." : "Upload & Extract"}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setShowConfirmClear(true)}
                >
                  Clear Year Data
                </Button>
              </div>
            </CardBody>
          </Card>

          {extractedText ? (
            <Card>
              <CardHeader title="OCR Extracted Text Preview" />
              <CardBody>
                <pre className="cc-scroll max-h-64 overflow-auto rounded-lg border border-line bg-canvas p-3 text-xs whitespace-pre-wrap text-ink-soft">
                  {extractedText}
                </pre>
              </CardBody>
            </Card>
          ) : null}

          {parsedPreviewByBranch.length > 0 ? (
            <Card>
              <CardHeader
                title="Branch-Wise Preview (Date/Time Ordered)"
                description="Review grouped rows before saving to the selected year."
              />
              <CardBody className="space-y-4">
                {parsedPreviewByBranch.map((group) => (
                  <div
                    key={group.branch}
                    className="overflow-hidden rounded-card border border-line"
                  >
                    <div className="flex items-center justify-between border-b border-line bg-canvas px-3 py-2">
                      <h4 className="text-sm font-semibold text-ink">
                        {group.branch}
                      </h4>
                      <Badge tone="neutral">{group.rows.length} exams</Badge>
                    </div>

                    <div className="cc-scroll max-h-72 space-y-2 overflow-auto p-3">
                      {group.rows.map((exam, rowIndex) => (
                        <div
                          key={`${group.branch}_${rowIndex}_${exam.courseCode || "row"}`}
                          className="grid grid-cols-1 gap-2 rounded-lg border border-line bg-surface p-2 text-xs sm:grid-cols-12"
                        >
                          <div className="sm:col-span-3">
                            <p className="font-semibold text-ink-faint">Date</p>
                            <p className="text-ink-soft">
                              {exam.date || "-"}
                              {exam.day ? ` (${exam.day})` : ""}
                            </p>
                          </div>
                          <div className="sm:col-span-3">
                            <p className="font-semibold text-ink-faint">Time</p>
                            <p className="text-ink-soft">{exam.time || "-"}</p>
                          </div>
                          <div className="sm:col-span-2">
                            <p className="font-semibold text-ink-faint">Code</p>
                            <p className="text-ink-soft">
                              {exam.courseCode || "-"}
                            </p>
                          </div>
                          <div className="sm:col-span-4">
                            <p className="font-semibold text-ink-faint">
                              Subject
                            </p>
                            <p className="text-ink-soft">
                              {exam.courseName || "-"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}

          {parsedExams.length > 0 ? (
            <Card>
              <CardHeader
                title={`Parsed Rows (${parsedExams.length})`}
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={addEmptyParsedExam}
                  >
                    <FiPlus /> Add Row
                  </Button>
                }
              />
              <CardBody>
                <TableWrap>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Day</TH>
                        <TH>Date</TH>
                        <TH>Time</TH>
                        <TH>Branch</TH>
                        <TH>Code</TH>
                        <TH>Course Name</TH>
                        <TH className="text-right">Remove</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {parsedExams.map((exam, index) => (
                        <TR key={`${exam.courseCode || "row"}_${index}`}>
                          <TD>
                            <Input
                              value={exam.day || ""}
                              onChange={(e) =>
                                updateParsedExam(index, "day", e.target.value)
                              }
                              placeholder="Day"
                            />
                          </TD>
                          <TD>
                            <Input
                              value={exam.date || ""}
                              onChange={(e) =>
                                updateParsedExam(index, "date", e.target.value)
                              }
                              placeholder="DD-MM-YYYY"
                            />
                          </TD>
                          <TD>
                            <Input
                              value={exam.time || ""}
                              onChange={(e) =>
                                updateParsedExam(index, "time", e.target.value)
                              }
                              placeholder="2:00 pm to 5:00 pm"
                            />
                          </TD>
                          <TD>
                            <Select
                              value={exam.branch || ""}
                              onChange={(e) =>
                                updateParsedExam(
                                  index,
                                  "branch",
                                  e.target.value,
                                )
                              }
                            >
                              <option value="">Select branch</option>
                              {BRANCH_OPTIONS.map((branch) => (
                                <option key={branch} value={branch}>
                                  {branch}
                                </option>
                              ))}
                            </Select>
                          </TD>
                          <TD>
                            <Input
                              value={exam.courseCode || ""}
                              onChange={(e) =>
                                updateParsedExam(
                                  index,
                                  "courseCode",
                                  e.target.value,
                                )
                              }
                              placeholder="Course Code"
                            />
                          </TD>
                          <TD>
                            <Input
                              value={exam.courseName || ""}
                              onChange={(e) =>
                                updateParsedExam(
                                  index,
                                  "courseName",
                                  e.target.value,
                                )
                              }
                              placeholder="Course Name"
                            />
                          </TD>
                          <TD className="text-right">
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => removeParsedExam(index)}
                              aria-label="Remove row"
                            >
                              <FiX />
                            </Button>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>

                <Button
                  variant="success"
                  fullWidth
                  className="mt-4"
                  onClick={handleSaveParsedExams}
                >
                  <FiSave /> Save Parsed Year Timetable
                </Button>
              </CardBody>
            </Card>
          ) : null}
        </div>
      ) : null}

      {activeTab === "manual" ? (
        <Card className="animate-fade-up">
          <CardHeader title={`Manual Exam Row Entry (${selectedYear} Year)`} />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Day (optional)" htmlFor="manual-day">
                <Input
                  id="manual-day"
                  type="text"
                  placeholder="Day (optional)"
                  value={manualExam.day}
                  onChange={(e) =>
                    setManualExam((prev) => ({ ...prev, day: e.target.value }))
                  }
                />
              </Field>
              <Field label="Date" htmlFor="manual-date">
                <Input
                  id="manual-date"
                  type="date"
                  value={manualExam.date}
                  onChange={(e) =>
                    setManualExam((prev) => ({ ...prev, date: e.target.value }))
                  }
                />
              </Field>
              <Field label="Time" htmlFor="manual-time">
                <Input
                  id="manual-time"
                  type="text"
                  placeholder="2:00 pm to 5:00 pm"
                  value={manualExam.time}
                  onChange={(e) =>
                    setManualExam((prev) => ({ ...prev, time: e.target.value }))
                  }
                />
              </Field>
              <Field label="Branch" htmlFor="manual-branch">
                <Select
                  id="manual-branch"
                  value={manualExam.branch}
                  onChange={(e) =>
                    setManualExam((prev) => ({
                      ...prev,
                      branch: e.target.value,
                    }))
                  }
                >
                  {BRANCH_OPTIONS.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Course Code" htmlFor="manual-code">
                <Input
                  id="manual-code"
                  type="text"
                  placeholder="Course Code"
                  value={manualExam.courseCode}
                  onChange={(e) =>
                    setManualExam((prev) => ({
                      ...prev,
                      courseCode: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Duration" htmlFor="manual-duration">
                <Input
                  id="manual-duration"
                  type="text"
                  placeholder="Duration"
                  value={manualExam.duration}
                  onChange={(e) =>
                    setManualExam((prev) => ({
                      ...prev,
                      duration: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field
                label="Course Name"
                htmlFor="manual-name"
                className="md:col-span-3"
              >
                <Input
                  id="manual-name"
                  type="text"
                  placeholder="Course Name"
                  value={manualExam.courseName}
                  onChange={(e) =>
                    setManualExam((prev) => ({
                      ...prev,
                      courseName: e.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <Button className="mt-4" onClick={handleAddManualExam}>
              <FiPlus /> Add Exam Row
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {activeTab === "view" ? (
        <Card className="animate-fade-up">
          <CardHeader
            title={`View Exams (${selectedYear} Year)`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={fetchExistingExams}>
                  <FiRefreshCw /> Refresh
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRemoveDuplicates}
                >
                  Remove Duplicates
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={toggleSelectAllExams}
                  disabled={existingExams.length === 0}
                >
                  {allViewRowsSelected ? "Unselect All" : "Select All"}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDeleteSelectedExams}
                  disabled={selectedExamIds.length === 0}
                >
                  <FiTrash2 /> Delete Selected ({selectedExamIds.length})
                </Button>
                <Badge tone="neutral">{existingExams.length} rows</Badge>
              </div>
            }
          />
          <CardBody>
            {loadingExams ? (
              <PageLoader label="Loading exam rows..." />
            ) : existingExams.length === 0 ? (
              <EmptyState
                title="No exam rows found"
                description="No exam rows found for this year."
              />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-10">
                        <input
                          type="checkbox"
                          checked={allViewRowsSelected}
                          onChange={toggleSelectAllExams}
                          className="h-4 w-4 accent-brand-600"
                          aria-label="Select all exams"
                        />
                      </TH>
                      <TH>Day</TH>
                      <TH>Date</TH>
                      <TH>Time</TH>
                      <TH>Branch</TH>
                      <TH>Code</TH>
                      <TH>Course</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {existingExams.map((exam) => {
                      const isEditing = editingExam?.id === exam.id;
                      const selected = selectedExamIdSet.has(exam.id);
                      return (
                        <TR
                          key={exam.id}
                          className={selected ? "bg-brand-50/60" : ""}
                        >
                          <TD>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleExamSelection(exam.id)}
                              className="h-4 w-4 accent-brand-600"
                              aria-label={`Select exam ${exam.courseCode || exam.id}`}
                            />
                          </TD>
                          {isEditing ? (
                            <>
                              <TD>
                                <Input
                                  value={editingExam.day || ""}
                                  onChange={(e) =>
                                    setEditingExam((prev) => ({
                                      ...prev,
                                      day: e.target.value,
                                    }))
                                  }
                                  placeholder="Day"
                                />
                              </TD>
                              <TD>
                                <Input
                                  value={editingExam.date || ""}
                                  onChange={(e) =>
                                    setEditingExam((prev) => ({
                                      ...prev,
                                      date: e.target.value,
                                    }))
                                  }
                                  placeholder="Date"
                                />
                              </TD>
                              <TD>
                                <Input
                                  value={editingExam.time || ""}
                                  onChange={(e) =>
                                    setEditingExam((prev) => ({
                                      ...prev,
                                      time: e.target.value,
                                    }))
                                  }
                                  placeholder="Time"
                                />
                              </TD>
                              <TD>
                                <Select
                                  value={editingExam.branch || ""}
                                  onChange={(e) =>
                                    setEditingExam((prev) => ({
                                      ...prev,
                                      branch: e.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Select branch</option>
                                  {BRANCH_OPTIONS.map((branch) => (
                                    <option key={branch} value={branch}>
                                      {branch}
                                    </option>
                                  ))}
                                </Select>
                              </TD>
                              <TD>
                                <Input
                                  value={editingExam.courseCode || ""}
                                  onChange={(e) =>
                                    setEditingExam((prev) => ({
                                      ...prev,
                                      courseCode: e.target.value,
                                    }))
                                  }
                                  placeholder="Code"
                                />
                              </TD>
                              <TD>
                                <Input
                                  value={editingExam.courseName || ""}
                                  onChange={(e) =>
                                    setEditingExam((prev) => ({
                                      ...prev,
                                      courseName: e.target.value,
                                    }))
                                  }
                                  placeholder="Course Name"
                                />
                              </TD>
                              <TD className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="success"
                                    size="sm"
                                    onClick={handleUpdateExam}
                                    aria-label="Save row"
                                  >
                                    <FiCheck />
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setEditingExam(null)}
                                    aria-label="Cancel edit"
                                  >
                                    <FiX />
                                  </Button>
                                </div>
                              </TD>
                            </>
                          ) : (
                            <>
                              <TD>{exam.day || "-"}</TD>
                              <TD>{exam.date || "-"}</TD>
                              <TD>{exam.time || "-"}</TD>
                              <TD>{exam.branch || "-"}</TD>
                              <TD>{exam.courseCode || "-"}</TD>
                              <TD>{exam.courseName || "-"}</TD>
                              <TD className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setEditingExam(exam)}
                                    aria-label="Edit row"
                                  >
                                    <FiEdit2 />
                                  </Button>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => handleDeleteExam(exam.id)}
                                    aria-label="Delete row"
                                  >
                                    <FiTrash2 />
                                  </Button>
                                </div>
                              </TD>
                            </>
                          )}
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardBody>
        </Card>
      ) : null}

      {activeTab === "pdf" ? (
        <div className="space-y-6 animate-fade-up">
          <Card>
            <CardHeader
              title={`Upload Official Timetable PDF (${selectedYear} Year)`}
              description="This PDF will be visible to students and teachers in their exam sections for this year."
            />
            <CardBody>
              <label
                htmlFor="exam-pdf-file"
                className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-line bg-canvas px-6 py-8 text-center transition hover:border-brand-400"
              >
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handlePdfFileChange}
                  className="hidden"
                  id="exam-pdf-file"
                />
                <FiFileText className="h-6 w-6 text-brand-500" />
                <p className="text-sm font-medium text-ink">
                  {pdfFile ? pdfFile.name : "Click to select timetable PDF"}
                </p>
                <p className="text-xs text-ink-faint">
                  Only PDF format is accepted for this tab.
                </p>
              </label>

              <Button
                className="mt-4"
                onClick={handleUploadPdf}
                disabled={!pdfFile || pdfUploading}
                loading={pdfUploading}
              >
                {pdfUploading ? "Uploading PDF..." : "Upload PDF"}
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={`Uploaded PDFs (${selectedYear} Year)`}
              actions={
                <Button variant="secondary" size="sm" onClick={fetchUploadedPdfs}>
                  <FiRefreshCw /> Refresh
                </Button>
              }
            />
            <CardBody>
              {uploadedPdfs.length === 0 ? (
                <EmptyState
                  icon={FiFileText}
                  title="No timetable PDF uploaded yet"
                  description="Upload an official timetable PDF to make it visible in student and teacher exam sections."
                />
              ) : (
                <div className="space-y-2">
                  {uploadedPdfs.map((pdf) => (
                    <div
                      key={pdf.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-canvas p-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {pdf.fileName || "exam-timetable.pdf"}
                        </p>
                        <p className="mt-1 text-xs text-ink-soft">
                          Status:{" "}
                          {pdf.active === false ? (
                            <Badge tone="neutral">Inactive</Badge>
                          ) : (
                            <Badge tone="success">Active</Badge>
                          )}
                        </p>
                      </div>
                      <a
                        href={pdf.fileURL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-3 text-xs font-medium text-white transition-colors hover:bg-brand-700"
                      >
                        Open PDF
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {activePdf ? (
                <p className="mt-3 text-xs text-emerald-700">
                  Active PDF is visible in student and teacher exam sections.
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      ) : null}

      <Modal
        open={showConfirmClear}
        onClose={() => setShowConfirmClear(false)}
        title="Clear Year Timetable?"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowConfirmClear(false)}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleClearYearExams}>
              Clear
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          This will remove all exam rows for {selectedYear} year.
        </p>
      </Modal>
    </div>
  );
}
