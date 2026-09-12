"use client";

import React, { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiDownload, FiFileText, FiLayers } from "react-icons/fi";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/client/firebase";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import {
  TableWrap,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/Table";
import { PageLoader, EmptyState, ErrorState } from "@/components/ui/States";

const YEARS = ["1st", "2nd", "3rd", "4th"];

const normalizeYearToken = (value = "") =>
  String(value || "").replace(/[^0-9]/g, "");

const parseExamDate = (dateStr = "") => {
  const raw = String(dateStr || "").trim();
  if (!raw) {
    return null;
  }

  const dmyMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]) - 1;
    const year = Number(dmyMatch[3]);
    return new Date(year < 100 ? 2000 + year : year, month, day);
  }

  const isoMatch = raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (isoMatch) {
    return new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
    );
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatExamDate = (dateValue = "") => {
  const parsed = parseExamDate(dateValue);
  if (!parsed) {
    return String(dateValue || "-");
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const resolveExamDay = (exam: any = {}) => {
  const explicitDay = String(exam.day || "").trim();
  if (explicitDay) {
    return explicitDay;
  }

  const parsed = parseExamDate(exam.date || "");
  if (!parsed) {
    return "-";
  }

  return parsed.toLocaleDateString("en-US", { weekday: "long" });
};

const resolveMillis = (value: any) => {
  if (!value) {
    return 0;
  }

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value?.seconds === "number") {
    return value.seconds * 1000;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const ExamTimetable = () => {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedYear, setSelectedYear] = useState("4th");

  const [allExams, setAllExams] = useState<any[]>([]);
  const [allPdfFiles, setAllPdfFiles] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async (uid: any) => {
      try {
        if (!uid) {
          return;
        }

        const sources = [
          { name: "users", fallbackRole: "" },
          { name: "students", fallbackRole: "student" },
          { name: "teachers", fallbackRole: "teacher" },
          { name: "admins", fallbackRole: "admin" },
        ];

        let profile = null;

        for (const source of sources) {
          const profileSnap = await getDoc(doc(db, source.name, uid));
          if (!profileSnap.exists()) {
            continue;
          }

          profile = profileSnap.data() || {};
          break;
        }

        if (!mounted || !profile) {
          return;
        }

        const year = (profile as any).year || "";

        if (year) {
          setSelectedYear(year);
        }
      } catch (profileError) {
        console.error(
          "Failed to load user profile for timetable:",
          profileError,
        );
      }
    };

    const initialUid = auth.currentUser?.uid;
    if (initialUid) {
      loadProfile(initialUid);
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser?.uid) {
        return;
      }
      loadProfile(firebaseUser.uid);
    });

    return () => {
      mounted = false;
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    setLoading(true);

    const unsubscribeExams = onSnapshot(
      collection(db, "examTimetable"),
      (snapshot) => {
        const rows = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
        }));

        setAllExams(rows);
        setError("");
        setLoading(false);
      },
      (subscriptionError) => {
        console.error("Failed to subscribe exam timetable:", subscriptionError);
        setError("Failed to load exam timetable.");
        setAllExams([]);
        setLoading(false);
      },
    );

    const unsubscribePdfs = onSnapshot(
      collection(db, "exam_timetable_files"),
      (snapshot) => {
        const rows = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
        }));

        setAllPdfFiles(rows);
      },
      (subscriptionError) => {
        console.error("Failed to subscribe timetable PDFs:", subscriptionError);
      },
    );

    return () => {
      unsubscribeExams();
      unsubscribePdfs();
    };
  }, []);

  const effectiveYear = String(selectedYear);

  const filteredExams = useMemo(() => {
    const yearToken = normalizeYearToken(effectiveYear);

    return allExams
      .filter((exam) => {
        if (exam?.isActive === false) {
          return false;
        }

        const yearMatch =
          !yearToken || normalizeYearToken(exam.year || "") === yearToken;
        return yearMatch;
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
  }, [allExams, effectiveYear]);

  const visiblePdfFiles = useMemo(() => {
    const yearToken = normalizeYearToken(effectiveYear);

    return allPdfFiles
      .filter((file) => {
        if (file?.active === false) {
          return false;
        }

        if (!yearToken) {
          return true;
        }

        return normalizeYearToken(file.year || "") === yearToken;
      })
      .sort((a, b) => {
        const diff =
          resolveMillis(b.updatedAt || b.createdAt) -
          resolveMillis(a.updatedAt || a.createdAt);
        return diff;
      });
  }, [allPdfFiles, effectiveYear]);

  const totalExamDays = useMemo(() => {
    return new Set(
      filteredExams.map((exam) =>
        String(exam.date || "")
          .trim()
          .toLowerCase(),
      ),
    ).size;
  }, [filteredExams]);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Exam Timetable"
        description="Complete year-wise schedule with live updates."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Exams" value={filteredExams.length} icon={FiCalendar} />
        <StatCard
          label="Exam Days"
          value={totalExamDays}
          icon={FiLayers}
          tone="success"
        />
        <StatCard
          label="Selected Year"
          value={effectiveYear || "All"}
          icon={FiFileText}
          tone="info"
        />
      </div>

      <Card>
        <CardHeader
          title="Filter timetable"
          description="Select any year to view its exam list and official PDF."
        />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {YEARS.map((year) => {
              const active =
                normalizeYearToken(effectiveYear) === normalizeYearToken(year);

              return (
                <Button
                  key={year}
                  variant={active ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setSelectedYear(year)}
                >
                  {year} Year
                </Button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {error ? <ErrorState title="Unable to load" description={error} /> : null}

      <Card>
        <CardHeader title="Official Timetable PDF" />
        <CardBody>
          {visiblePdfFiles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {visiblePdfFiles.map((file) => (
                <a
                  key={file.id}
                  href={file.fileURL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
                >
                  {(file.year || effectiveYear || "Year").trim()} PDF
                  <FiDownload className="h-4 w-4" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              No official timetable PDF uploaded for this year.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">
          Exam List ({effectiveYear || "All Years"})
        </h2>

        {loading ? (
          <PageLoader label="Loading timetable..." />
        ) : filteredExams.length === 0 ? (
          <EmptyState
            icon={FiCalendar}
            title="No exams found"
            description="No exams are available for the selected filters."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Day</TH>
                  <TH>Time</TH>
                  <TH>Course Code</TH>
                  <TH>Course Name</TH>
                  <TH>Branch</TH>
                  <TH>Duration</TH>
                  <TH>Year</TH>
                </tr>
              </THead>
              <TBody>
                {filteredExams.map((exam) => (
                  <TR key={exam.id}>
                    <TD className="text-ink-soft">{formatExamDate(exam.date)}</TD>
                    <TD className="text-ink-soft">{resolveExamDay(exam)}</TD>
                    <TD className="text-ink-soft">{exam.time || "Time TBA"}</TD>
                    <TD className="font-medium">{exam.courseCode || "-"}</TD>
                    <TD className="font-medium">{exam.courseName || "Course"}</TD>
                    <TD className="text-ink-soft">{exam.branch || "-"}</TD>
                    <TD className="text-ink-soft">{exam.duration || "-"}</TD>
                    <TD className="text-ink-soft">{exam.year || "-"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </div>
    </div>
  );
};

export default ExamTimetable;
