"use client";

import React, { useEffect, useMemo, useState } from "react";
import { auth, firestore } from "@/lib/client/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { useRouter } from "next/navigation";
import {
  FiAlertCircle,
  FiBell,
  FiBook,
  FiCalendar,
  FiCheck,
  FiChevronRight,
  FiClock,
  FiDownload,
  FiFileText,
  FiGrid,
  FiMapPin,
  FiMessageCircle,
  FiUsers,
} from "react-icons/fi";
import {
  CalendarDays,
  CalendarRange,
  Bell,
  BookOpen,
  ClipboardCheck,
  MessageCircle,
  FileText,
  Clock,
  CalendarClock,
} from "lucide-react";
import FixItBoard from "@/components/common/FixItBoard";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Tabs from "@/components/ui/Tabs";
import { Input } from "@/components/ui/Field";
import {
  TableWrap,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/Table";
import {
  Skeleton,
  SkeletonCards,
  SkeletonRows,
  EmptyState,
} from "@/components/ui/States";

const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const branchMappings = {
  "Computer Engineering": ["computer", "comp", "cse", "cs", "co"],
  "Electronics And TeleCommunication Engineering": [
    "electronics",
    "e&tc",
    "entc",
    "ece",
    "etc",
    "et",
  ],
  "Mechanical Engineering": ["mechanical", "mech", "me"],
  "Civil Engineering": ["civil", "ce"],
  "Electrical Engineering": ["electrical", "ee", "eee"],
  "Instrumentation Engineering": ["instrumentation", "inst", "in"],
  "Information Technology": ["information", "it"],
};

const normalizeAssignments = (teacherData: any = {}) => {
  if (
    Array.isArray(teacherData.assignments) &&
    teacherData.assignments.length > 0
  ) {
    return teacherData.assignments;
  }

  if (
    Array.isArray(teacherData.assignedCourses) &&
    teacherData.assignedCourses.length > 0
  ) {
    const fallbackBranch = teacherData.department || teacherData.dept || "";
    return teacherData.assignedCourses.map((course) => ({
      branch: fallbackBranch,
      year: course.year || "",
      subjects: Array.isArray(course.subjects) ? course.subjects : [],
    }));
  }

  if (teacherData.year && Array.isArray(teacherData.subjects)) {
    return [
      {
        branch: teacherData.department || teacherData.dept || "",
        year: teacherData.year,
        subjects: teacherData.subjects,
      },
    ];
  }

  return [];
};

const parseExamDate = (dateStr = "") => {
  const raw = String(dateStr || "").trim();
  if (!raw) return null;

  const dmyMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]) - 1;
    const year = Number(dmyMatch[3]);
    return new Date(year < 100 ? 2000 + year : year, month, day);
  }

  const isoMatch = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
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

const normalizeYearToken = (value = "") =>
  String(value || "").replace(/[^0-9]/g, "");

const toLocalDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const branchMatches = (examBranch = "", targetBranch = "") => {
  const exam = String(examBranch || "")
    .trim()
    .toLowerCase();
  const target = String(targetBranch || "")
    .trim()
    .toLowerCase();
  if (!target) return true;
  if (!exam) return false;
  if (exam === target) return true;
  if (exam.includes(target) || target.includes(exam)) return true;

  const aliases = branchMappings[targetBranch] || [];
  return aliases.some((alias) => exam.includes(alias));
};

const readTeacherTimetable = async (teacherUid) => {
  const collectionNames = ["timetables", "timetable"];
  const list = [];

  for (const name of collectionNames) {
    try {
      const snapshot = await getDocs(collection(firestore, name));
      snapshot.docs.forEach((entry) => {
        const data = entry.data() || {};
        const ownerId = data.teacherId || data.teacherUid || data.uid || "";
        if (String(ownerId) !== String(teacherUid)) return;

        list.push({
          id: entry.id,
          source: name,
          subject: data.subjectName || data.subject || "Subject",
          day: data.day || "",
          startTime: data.startTime || "",
          endTime: data.endTime || "",
          room: data.room || data.classroom || "",
          branch: data.branch || data.department || "",
          year: data.year || "",
          semester: data.semester || "",
        });
      });
    } catch (error) {
      console.error(`Unable to fetch ${name}:`, error);
    }
  }

  return list.sort((a, b) =>
    String(a.startTime || "00:00").localeCompare(
      String(b.startTime || "00:00"),
    ),
  );
};

function TeacherDashboard() {
  const router = useRouter();
  const [user] = useAuthState(auth);

  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [department, setDepartment] = useState("");
  const [teacherAssignments, setTeacherAssignments] = useState([]);

  const [allTimetable, setAllTimetable] = useState([]);
  const [todaysClasses, setTodaysClasses] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [studyMaterials, setStudyMaterials] = useState([]);
  const [examSchedule, setExamSchedule] = useState([]);
  const [examTimetableFiles, setExamTimetableFiles] = useState([]);
  const [examCalendarMonth, setExamCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [announcements, setAnnouncements] = useState([]);
  const [eventsCalendar, setEventsCalendar] = useState([]);
  const [academicCalendar, setAcademicCalendar] = useState([]);

  const [activeTab, setActiveTab] = useState("overview");
  const [selectedAssignmentIndex, setSelectedAssignmentIndex] = useState(0);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);

  const todayName = useMemo(() => {
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    return days[new Date().getDay()];
  }, []);

  const navItems = useMemo(
    () => [
      { id: "overview", label: "Overview", icon: FiGrid },
      { id: "announcements", label: "Announcements", icon: FiBell },
      { id: "fixit", label: "FixIt", icon: FiAlertCircle },
      { id: "calendars", label: "Calendars", icon: FiCalendar },
      { id: "chats", label: "Student Chats", icon: FiMessageCircle },
      { id: "courses", label: "Courses", icon: FiBook },
      { id: "students", label: "Students", icon: FiUsers },
      { id: "study-materials", label: "Study Materials", icon: FiBook },
      { id: "attendance", label: "Attendance", icon: FiCheck },
      { id: "timetable", label: "My Timetable", icon: FiClock },
      { id: "exams", label: "Exam Schedule", icon: FiFileText },
    ],
    [],
  );

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }

    let unsubAnnouncements = () => {};
    let unsubEvents = () => {};
    let unsubAcademic = () => {};

    const loadDashboard = async () => {
      try {
        setLoading(true);

        const teacherSnap = await getDoc(doc(firestore, "teachers", user.uid));
        let teacherDisplayName = user.displayName || "Teacher";
        let assignments = [];

        if (teacherSnap.exists()) {
          const teacherData = teacherSnap.data() || {};
          assignments = normalizeAssignments(teacherData);
          setTeacherAssignments(assignments);
          setTeacherName(
            teacherData.name ||
              teacherData.displayName ||
              user.displayName ||
              "Teacher",
          );
          teacherDisplayName =
            teacherData.name ||
            teacherData.displayName ||
            user.displayName ||
            "Teacher";
          setDepartment(teacherData.dept || teacherData.department || "");
        } else {
          setTeacherName(user.displayName || "Teacher");
          setTeacherAssignments([]);
        }

        const timetable = await readTeacherTimetable(user.uid);
        setAllTimetable(timetable);
        setTodaysClasses(timetable.filter((item) => item.day === todayName));

        // Render the dashboard shell early; continue fetching heavy datasets in background.
        setLoading(false);

        const [studentsSnap, usersSnap] = await Promise.all([
          getDocs(collection(firestore, "students")),
          getDocs(collection(firestore, "users")),
        ]);

        const mergedStudents = new Map();
        const absorbStudent = (record) => {
          const uid = record.uid || record.id;
          if (!uid) return;
          const existing = mergedStudents.get(uid) || {};
          mergedStudents.set(uid, {
            ...existing,
            ...record,
            uid,
          });
        };

        studentsSnap.docs.forEach((entry) =>
          absorbStudent({ id: entry.id, ...entry.data() }),
        );
        usersSnap.docs.forEach((entry) => {
          const data = entry.data() || {};
          if ((data.role || "").toLowerCase() !== "student") return;
          absorbStudent({ id: entry.id, ...data });
        });
        setAllStudents(Array.from(mergedStudents.values()));

        const materialsQuery = query(
          collection(firestore, "studyMaterials"),
          orderBy("createdAt", "desc"),
          limit(24),
        );
        const materialsSnapshot = await getDocs(materialsQuery);
        const ownMaterials = materialsSnapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() } as any))
          .filter(
            (material) =>
              String(material.uploadedBy || "") === String(user.uid) ||
              String(material.uploadedByName || "").toLowerCase() ===
                String(teacherDisplayName || "").toLowerCase(),
          );
        setStudyMaterials(ownMaterials);

        const annQuery = query(
          collection(firestore, "announcements"),
          where("active", "==", true),
        );
        unsubAnnouncements = onSnapshot(annQuery, (snapshot) => {
          const rows = snapshot.docs
            .map((entry) => ({ id: entry.id, ...entry.data() } as any))
            .sort((a, b) => {
              const ta = a.createdAt?.toMillis?.() || 0;
              const tb = b.createdAt?.toMillis?.() || 0;
              return tb - ta;
            });
          setAnnouncements(rows);
        });

        const eventsQuery = query(
          collection(firestore, "events"),
          orderBy("startDate"),
          limit(8),
        );
        unsubEvents = onSnapshot(
          eventsQuery,
          (snapshot) => {
            setEventsCalendar(
              snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as any)),
            );
          },
          () => setEventsCalendar([]),
        );

        const academicQuery = query(
          collection(firestore, "academicCalendar"),
          orderBy("startDate"),
          limit(8),
        );
        unsubAcademic = onSnapshot(
          academicQuery,
          (snapshot) => {
            setAcademicCalendar(
              snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as any)),
            );
          },
          () => setAcademicCalendar([]),
        );
      } catch (error) {
        console.error("Failed to load teacher dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();

    return () => {
      unsubAnnouncements();
      unsubEvents();
      unsubAcademic();
    };
  }, [user, router, todayName]);

  useEffect(() => {
    if (!user) {
      return () => {};
    }

    const assignmentScopes = (teacherAssignments || []).map((assignment) => ({
      yearToken: normalizeYearToken(assignment?.year || ""),
      branch: assignment?.branch || "",
    }));

    const scopeYearTokens = new Set(
      assignmentScopes
        .map((scope) => scope.yearToken)
        .filter((token) => token.length > 0),
    );

    const unsubscribeExams = onSnapshot(
      collection(firestore, "examTimetable"),
      (snapshot) => {
        const filteredExams = snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() } as any))
          .filter((exam) => {
            if (exam?.isActive === false) {
              return false;
            }

            if (assignmentScopes.length > 0) {
              return assignmentScopes.some((scope) => {
                const sameYear =
                  !scope.yearToken ||
                  normalizeYearToken(exam.year || "") === scope.yearToken;
                const sameBranch =
                  !scope.branch ||
                  branchMatches(exam.branch || "", scope.branch || "");
                return sameYear && sameBranch;
              });
            }

            if (department) {
              return branchMatches(exam.branch || "", department);
            }

            return false;
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

        setExamSchedule(filteredExams);
      },
      (error) => {
        console.error("Failed to subscribe exam schedule:", error);
        setExamSchedule([]);
      },
    );

    const unsubscribeExamPdfs = onSnapshot(
      collection(firestore, "exam_timetable_files"),
      (snapshot) => {
        const files = snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() } as any))
          .filter((file) => {
            if (file?.active === false) {
              return false;
            }

            if (assignmentScopes.length > 0 && scopeYearTokens.size > 0) {
              const fileYearToken = normalizeYearToken(file.year || "");
              return scopeYearTokens.has(fileYearToken);
            }

            if (assignmentScopes.length === 0) {
              return false;
            }

            return true;
          })
          .sort((a, b) => {
            const aMs =
              a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
            const bMs =
              b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
            return bMs - aMs;
          });

        setExamTimetableFiles(files);
      },
      (error) => {
        console.error("Failed to subscribe timetable PDFs:", error);
        setExamTimetableFiles([]);
      },
    );

    return () => {
      unsubscribeExams();
      unsubscribeExamPdfs();
    };
  }, [user, teacherAssignments, department]);

  useEffect(() => {
    if (!examSchedule.length) {
      return;
    }

    const upcoming = examSchedule
      .map((exam) => parseExamDate(exam.date || ""))
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    if (upcoming) {
      setExamCalendarMonth(
        new Date(upcoming.getFullYear(), upcoming.getMonth(), 1),
      );
    }
  }, [examSchedule]);

  const unreadAnnouncements = announcements.length;
  const upcomingClasses = allTimetable.filter(
    (item) => item.day && dayOrder.includes(item.day),
  ).length;

  const assignmentStudentGroups = useMemo(() => {
    if (!teacherAssignments.length) return [];

    return teacherAssignments.map((assignment, index) => {
      const rows = allStudents
        .map((student) => {
          const studentBranch = String(student.dept || student.department || "")
            .trim()
            .toLowerCase();
          const studentYear = String(student.year || "")
            .trim()
            .toLowerCase();
          const studentSubjects = Array.isArray(student.subjects)
            ? student.subjects.map((subject) => String(subject).trim())
            : [];

          const branchOk =
            String(assignment.branch || "")
              .trim()
              .toLowerCase() === studentBranch;
          const yearOk =
            String(assignment.year || "")
              .trim()
              .toLowerCase() === studentYear;

          if (!branchOk || !yearOk) return null;

          const matchedSubjects = (assignment.subjects || []).filter(
            (subject) => studentSubjects.includes(subject),
          );

          if (
            (assignment.subjects || []).length > 0 &&
            !matchedSubjects.length
          ) {
            return null;
          }

          return {
            uid: student.uid,
            name: student.name || "Student",
            prn: student.prn || student.rollNo || student.rollNumber || "-",
            year: student.year || "-",
            matchedSubjects,
            branch: assignment.branch || "-",
          };
        })
        .filter(Boolean);

      return {
        key: `${assignment.branch || "branch"}_${assignment.year || "year"}_${index}`,
        assignment,
        students: rows,
      };
    });
  }, [allStudents, teacherAssignments]);

  const selectedGroup =
    assignmentStudentGroups[selectedAssignmentIndex] || null;

  const filteredSelectedStudents = useMemo(() => {
    if (!selectedGroup) return [];
    const needle = String(studentSearch || "")
      .trim()
      .toLowerCase();
    if (!needle) return selectedGroup.students;

    return selectedGroup.students.filter(
      (student) =>
        String(student.name || "")
          .toLowerCase()
          .includes(needle) ||
        String(student.prn || "")
          .toLowerCase()
          .includes(needle),
    );
  }, [selectedGroup, studentSearch]);

  useEffect(() => {
    setSelectedStudentIds([]);
  }, [selectedAssignmentIndex, studentSearch]);

  useEffect(() => {
    if (selectedAssignmentIndex > assignmentStudentGroups.length - 1) {
      setSelectedAssignmentIndex(0);
    }
  }, [assignmentStudentGroups.length, selectedAssignmentIndex]);

  const toggleSelectStudent = (uid) => {
    setSelectedStudentIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    );
  };

  const toggleSelectAll = () => {
    const ids = filteredSelectedStudents.map((student) => student.uid);
    const allSelected =
      ids.length > 0 && ids.every((id) => selectedStudentIds.includes(id));
    if (allSelected) {
      setSelectedStudentIds((prev) => prev.filter((id) => !ids.includes(id)));
      return;
    }
    setSelectedStudentIds((prev) => [...new Set([...prev, ...ids])]);
  };

  const getStudentCsvContent = (rows) => {
    const header = ["Name", "PRN", "Year", "Branch", "Matched Subjects"];
    const safeRows = Array.isArray(rows) ? rows : [];
    const lines = safeRows.map((student) => [
      student.name || "",
      student.prn || "",
      student.year || "",
      student.branch || "",
      (student.matchedSubjects || []).join("; "),
    ]);

    return [header, ...lines]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
  };

  const downloadCsvFile = (fileName, content) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportStudentsPdf = (title, rows) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const tableRows = (Array.isArray(rows) ? rows : [])
      .map(
        (student) => `
        <tr>
          <td>${student.name || "-"}</td>
          <td>${student.prn || "-"}</td>
          <td>${student.year || "-"}</td>
          <td>${student.branch || "-"}</td>
          <td>${(student.matchedSubjects || []).join(", ") || "-"}</td>
        </tr>`,
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; color: #0f172a; }
            h1 { font-size: 18px; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
            th { background: #e2e8f0; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>PRN</th>
                <th>Year</th>
                <th>Branch</th>
                <th>Matched Subjects</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const timeSlots = [
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
  ];

  const getClassesForSlot = (day, timeSlot) =>
    allTimetable.filter((item) => {
      const start = String(item.startTime || "");
      const end = String(item.endTime || "");
      return item.day === day && start <= timeSlot && end > timeSlot;
    });

  const quickActions = [
    {
      label: "Attendance",
      description: "Track and manage sessions",
      route: "/teacher-attendance",
      icon: ClipboardCheck,
    },
    {
      label: "Student Chats",
      description: "Real-time conversations",
      route: "/chat",
      icon: MessageCircle,
    },
    {
      label: "Study Materials",
      description: "Upload and manage",
      route: "/teacher-studymaterial",
      icon: BookOpen,
    },
    {
      label: "My Timetable",
      description: "Weekly schedule editor",
      route: "/teacher-timetable",
      icon: Clock,
    },
    {
      label: "Exam Schedule",
      description: "Official exam timetable",
      route: "/exam-timetable",
      icon: FileText,
    },
    {
      label: "Calendars",
      description: "Events & academic hub",
      route: "/calendars",
      icon: CalendarClock,
    },
  ];

  const renderOverview = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Today's Classes"
          description={`Your schedule for ${todayName}`}
        />
        <CardBody className="space-y-3">
          {todaysClasses.length > 0 ? (
            todaysClasses.map((item) => (
              <div
                key={`${item.source}_${item.id}`}
                className="rounded-card border border-line bg-slate-50/60 p-4"
              >
                <p className="text-base font-semibold text-ink">
                  {item.subject}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft sm:text-sm">
                  <span className="inline-flex items-center gap-1">
                    <FiClock className="h-4 w-4" /> {item.startTime || "--:--"}{" "}
                    - {item.endTime || "--:--"}
                  </span>
                  {item.room ? (
                    <span className="inline-flex items-center gap-1">
                      <FiMapPin className="h-4 w-4" /> {item.room}
                    </span>
                  ) : null}
                  {item.year ? <Badge tone="neutral">{item.year}</Badge> : null}
                  {item.semester ? (
                    <Badge tone="info">Sem {item.semester}</Badge>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No classes today"
              description="You have no classes scheduled for today."
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Quick Actions"
          description="Jump to the tools you use most"
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.route}
                  type="button"
                  onClick={() => router.push(action.route)}
                  className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 text-left shadow-card transition hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">
                      {action.label}
                    </span>
                    <span className="block truncate text-xs text-ink-soft">
                      {action.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  );

  const renderAnnouncements = () => (
    <Card>
      <CardHeader
        title="Announcements"
        description="Updates relevant for faculty and students."
      />
      <CardBody>
        {announcements.length > 0 ? (
          <div className="space-y-3">
            {announcements.map((item) => (
              <div
                key={item.id}
                className="rounded-card border border-line bg-slate-50/60 p-4"
              >
                <p className="text-base font-semibold text-ink">
                  {item.title || "Announcement"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">
                  {item.message || "No details available."}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Bell}
            title="No announcements"
            description="There are no active announcements right now."
          />
        )}
      </CardBody>
    </Card>
  );

  const renderCalendars = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Calendar Hub"
          description="View full events and academic calendars in a dedicated page."
          actions={
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push("/calendars")}
            >
              Open Main Calendars <FiChevronRight className="h-4 w-4" />
            </Button>
          }
        />
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Events" />
          <CardBody>
            {eventsCalendar.length > 0 ? (
              <div className="space-y-3">
                {eventsCalendar.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-card border border-line bg-slate-50/60 p-3"
                  >
                    <p className="font-medium text-ink">
                      {item.title || "Event"}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {item.startDate || "Date TBA"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FiCalendar}
                title="No events"
                description="No events available."
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Academic Calendar" />
          <CardBody>
            {academicCalendar.length > 0 ? (
              <div className="space-y-3">
                {academicCalendar.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-card border border-line bg-slate-50/60 p-3"
                  >
                    <p className="font-medium text-ink">
                      {item.activity || item.title || "Academic Event"}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {item.startDate || item.dateSlots || "Date not available"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FiCalendar}
                title="No academic items"
                description="No academic calendar items available."
              />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );

  const renderCourses = () => (
    <Card>
      <CardHeader title="Assigned Courses" />
      <CardBody>
        {teacherAssignments.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {teacherAssignments.map((assignment, index) => (
              <div
                key={`${assignment.branch}_${assignment.year}_${index}`}
                className="rounded-card border border-line bg-slate-50/60 p-4"
              >
                <p className="text-base font-semibold text-ink">
                  {assignment.branch || "Branch"} • {assignment.year || "Year"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(assignment.subjects || []).map((subject) => (
                    <Badge key={`${assignment.year}_${subject}`} tone="brand">
                      {subject}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FiBook}
            title="No courses assigned"
            description="No teaching assignments found yet."
          />
        )}
      </CardBody>
    </Card>
  );

  const renderStudents = () => (
    <Card>
      <CardHeader
        title="Students"
        actions={
          <Badge tone="brand">
            {assignmentStudentGroups.reduce(
              (acc, group) => acc + group.students.length,
              0,
            )}{" "}
            total
          </Badge>
        }
      />
      <CardBody>
        {assignmentStudentGroups.length > 0 ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {assignmentStudentGroups.map((group, index) => {
                const isActive = selectedAssignmentIndex === index;
                const assignmentLabel = `${group.assignment.branch || "Branch"} • ${group.assignment.year || "Year"}`;
                return (
                  <Button
                    key={group.key}
                    variant={isActive ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setSelectedAssignmentIndex(index)}
                  >
                    {assignmentLabel} ({group.students.length})
                  </Button>
                );
              })}
            </div>

            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Input
                type="text"
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                placeholder="Search by student name or PRN"
                className="w-full sm:max-w-xs"
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const rows = filteredSelectedStudents.filter((student) =>
                      selectedStudentIds.includes(student.uid),
                    );
                    if (!rows.length) return;
                    const fileName = `${String(
                      selectedGroup?.assignment?.branch || "branch",
                    )
                      .toLowerCase()
                      .replace(
                        /[^a-z0-9]+/g,
                        "_",
                      )}_${String(selectedGroup?.assignment?.year || "year").toLowerCase()}_selected_students.csv`;
                    downloadCsvFile(fileName, getStudentCsvContent(rows));
                  }}
                >
                  Export Selected CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const rows = filteredSelectedStudents.filter((student) =>
                      selectedStudentIds.includes(student.uid),
                    );
                    if (!rows.length) return;
                    exportStudentsPdf("Selected Students Report", rows);
                  }}
                >
                  Export Selected PDF
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (!filteredSelectedStudents.length) return;
                    const fileName = `${String(
                      selectedGroup?.assignment?.branch || "branch",
                    )
                      .toLowerCase()
                      .replace(
                        /[^a-z0-9]+/g,
                        "_",
                      )}_${String(selectedGroup?.assignment?.year || "year").toLowerCase()}_all_students.csv`;
                    downloadCsvFile(
                      fileName,
                      getStudentCsvContent(filteredSelectedStudents),
                    );
                  }}
                >
                  Export All CSV
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (!filteredSelectedStudents.length) return;
                    exportStudentsPdf(
                      "All Students Report",
                      filteredSelectedStudents,
                    );
                  }}
                >
                  Export All PDF
                </Button>
              </div>
            </div>

            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>
                      <input
                        type="checkbox"
                        checked={
                          filteredSelectedStudents.length > 0 &&
                          filteredSelectedStudents.every((student) =>
                            selectedStudentIds.includes(student.uid),
                          )
                        }
                        onChange={toggleSelectAll}
                      />
                    </TH>
                    <TH>Name</TH>
                    <TH>PRN / Roll</TH>
                    <TH>Year</TH>
                    <TH>Branch</TH>
                    <TH>Matched Subjects</TH>
                  </tr>
                </THead>
                <TBody>
                  {filteredSelectedStudents.map((student) => (
                    <TR key={student.uid}>
                      <TD>
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(student.uid)}
                          onChange={() => toggleSelectStudent(student.uid)}
                        />
                      </TD>
                      <TD className="font-medium text-ink">{student.name}</TD>
                      <TD className="text-ink-soft">{student.prn}</TD>
                      <TD className="text-ink-soft">{student.year}</TD>
                      <TD className="text-ink-soft">{student.branch}</TD>
                      <TD className="text-ink-soft">
                        {(student.matchedSubjects || []).join(", ") || "-"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </>
        ) : (
          <EmptyState
            icon={FiUsers}
            title="No student groups"
            description="No assigned branch-year student groups found."
          />
        )}
      </CardBody>
    </Card>
  );

  const renderStudyMaterials = () => (
    <Card>
      <CardHeader
        title="Study Materials"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push("/teacher-studymaterial")}
          >
            Manage <FiChevronRight className="h-4 w-4" />
          </Button>
        }
      />
      <CardBody>
        {studyMaterials.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {studyMaterials.map((material) => (
              <div
                key={material.id}
                className="rounded-card border border-line bg-slate-50/60 p-4"
              >
                <p className="text-base font-semibold text-ink">
                  {material.title || "Untitled"}
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  {material.subject || "Subject"} •{" "}
                  {material.department || "Department"}
                </p>
                {material.description ? (
                  <p className="mt-2 line-clamp-3 text-sm text-ink-soft">
                    {material.description}
                  </p>
                ) : null}
                {material.fileURL ? (
                  <a
                    href={material.fileURL}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Download <FiDownload className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FiBook}
            title="No study materials"
            description="No uploaded materials found yet."
          />
        )}
      </CardBody>
    </Card>
  );

  const renderTimetable = () => (
    <Card>
      <CardHeader
        title="My Timetable"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push("/teacher-timetable")}
          >
            Full Editor <FiChevronRight className="h-4 w-4" />
          </Button>
        }
      />
      <CardBody>
        {allTimetable.length > 0 ? (
          <div className="cc-scroll overflow-x-auto rounded-card border border-line">
            <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="border border-slate-200 px-3 py-2 text-left">
                  Time
                </th>
                {dayOrder.map((day) => (
                  <th
                    key={day}
                    className="border border-slate-200 px-3 py-2 text-center"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((slot) => (
                <tr key={slot}>
                  <td className="border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700">
                    {slot}
                  </td>
                  {dayOrder.map((day) => {
                    const slotClasses = getClassesForSlot(day, slot);
                    return (
                      <td
                        key={`${day}_${slot}`}
                        className="border border-slate-200 px-2 py-2 align-top"
                      >
                        {slotClasses.map((classItem) => (
                          <div
                            key={`${classItem.source}_${classItem.id}`}
                            className="mb-1 rounded-lg border border-blue-200 bg-blue-50 p-2"
                          >
                            <p className="text-xs font-semibold text-slate-800">
                              {classItem.subject}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-600">
                              {classItem.startTime} - {classItem.endTime}
                            </p>
                            {classItem.room ? (
                              <p className="text-[11px] text-slate-600">
                                {classItem.room}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <EmptyState
            icon={FiClock}
            title="No timetable entries"
            description="No timetable entries found."
          />
        )}
      </CardBody>
    </Card>
  );

  const renderExams = () => (
    <Card>
      <CardHeader
        title="Exam Schedule"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push("/exam-timetable")}
          >
            Open Full View <FiChevronRight className="h-4 w-4" />
          </Button>
        }
      />
      <CardBody>
      {examTimetableFiles.length > 0 ? (
        <div className="mb-4 rounded-card border border-sky-200 bg-sky-50 p-3">
          <p className="text-sm font-semibold text-slate-800">
            Official Timetable PDF
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {examTimetableFiles.map((file) => (
              <a
                key={file.id}
                href={file.fileURL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-[#2f87d9] px-3 py-1.5 text-xs font-medium text-white"
              >
                {(file.year || "Year").trim()} PDF
                <FiDownload className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {examSchedule.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
          {(() => {
            const monthStart = new Date(
              examCalendarMonth.getFullYear(),
              examCalendarMonth.getMonth(),
              1,
            );
            const monthEnd = new Date(
              examCalendarMonth.getFullYear(),
              examCalendarMonth.getMonth() + 1,
              0,
            );

            const examRows = examSchedule
              .map((exam) => {
                const parsedDate = parseExamDate(exam.date || "");
                return parsedDate ? { ...exam, parsedDate } : null;
              })
              .filter(Boolean);

            const examMap = new Map();
            examRows.forEach((exam) => {
              const key = toLocalDateKey(exam.parsedDate);
              if (!examMap.has(key)) {
                examMap.set(key, []);
              }
              examMap.get(key).push(exam);
            });

            const firstWeekday = monthStart.getDay();
            const totalDays = monthEnd.getDate();
            const cells = [];

            for (let i = 0; i < firstWeekday; i += 1) {
              cells.push({ key: `blank_${i}`, isBlank: true });
            }

            for (let day = 1; day <= totalDays; day += 1) {
              const date = new Date(
                examCalendarMonth.getFullYear(),
                examCalendarMonth.getMonth(),
                day,
              );
              const key = toLocalDateKey(date);
              cells.push({
                key,
                day,
                date,
                exams: examMap.get(key) || [],
                isToday: key === toLocalDateKey(new Date()),
              });
            }

            return (
              <>
                <div className="mb-3 flex items-center justify-between rounded-xl bg-white px-3 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExamCalendarMonth(
                        (prev) =>
                          new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                      )
                    }
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Prev
                  </button>
                  <p className="text-sm font-semibold text-slate-800 sm:text-base">
                    {monthStart.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setExamCalendarMonth(
                        (prev) =>
                          new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                      )
                    }
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Next
                  </button>
                </div>

                <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (name) => (
                      <div key={name} className="rounded-lg bg-white py-2">
                        {name}
                      </div>
                    ),
                  )}
                </div>

                <div className="grid grid-cols-7 gap-1 sm:gap-2">
                  {cells.map((cell) => {
                    if (cell.isBlank) {
                      return (
                        <div
                          key={cell.key}
                          className="min-h-[78px] rounded-lg border border-transparent bg-transparent"
                        />
                      );
                    }

                    return (
                      <div
                        key={cell.key}
                        className={`group relative min-h-[78px] rounded-lg border bg-white p-2 transition sm:min-h-[90px] ${
                          cell.exams.length
                            ? "border-[#9cc7f2] shadow-sm"
                            : "border-slate-200"
                        } ${cell.isToday ? "ring-2 ring-[#2f87d9]/40" : ""}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-700 sm:text-sm">
                            {cell.day}
                          </span>
                          {cell.exams.length ? (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2f87d9] px-1 text-[10px] font-semibold text-white">
                              {cell.exams.length}
                            </span>
                          ) : null}
                        </div>

                        {cell.exams.length ? (
                          <div className="mt-1 space-y-1">
                            {cell.exams.slice(0, 2).map((exam) => (
                              <p
                                key={`${cell.key}_${exam.id}`}
                                className="truncate rounded bg-[#eef6ff] px-1.5 py-0.5 text-[10px] font-medium text-[#1f6fb7]"
                              >
                                {exam.courseCode || exam.courseName}
                              </p>
                            ))}
                          </div>
                        ) : null}

                        {cell.exams.length ? (
                          <div className="pointer-events-none absolute left-1/2 top-[100%] z-30 hidden w-60 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl group-hover:block">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {cell.date.toLocaleDateString("en-US", {
                                weekday: "long",
                                day: "numeric",
                                month: "short",
                              })}
                            </p>
                            <div className="space-y-2">
                              {cell.exams.map((exam) => (
                                <div
                                  key={`hover_${cell.key}_${exam.id}`}
                                  className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                                >
                                  <p className="text-xs font-semibold text-slate-800">
                                    {exam.courseCode || "-"} •{" "}
                                    {exam.courseName || "Course"}
                                  </p>
                                  <p className="mt-1 text-[11px] text-slate-600">
                                    {exam.time || "Time TBA"}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    {exam.branch || "Branch"} •{" "}
                                    {exam.year || "Year"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        <EmptyState
          icon={FiFileText}
          title="No exams scheduled"
          description="No exams available for assigned class groups."
        />
      )}
      </CardBody>
    </Card>
  );

  const renderActionPanel = (title, description, route, cta) => (
    <Card>
      <CardBody>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-soft">{description}</p>
        <Button
          variant="primary"
          size="md"
          className="mt-4"
          onClick={() => router.push(route)}
        >
          {cta} <FiChevronRight className="h-4 w-4" />
        </Button>
      </CardBody>
    </Card>
  );

  const renderActivePanel = () => {
    if (activeTab === "overview") return renderOverview();
    if (activeTab === "announcements") return renderAnnouncements();
    if (activeTab === "fixit")
      return <FixItBoard role="teacher" displayName={teacherName} />;
    if (activeTab === "calendars") return renderCalendars();
    if (activeTab === "chats")
      return renderActionPanel(
        "Student Chats",
        "Manage real-time conversations with students.",
        "/chat",
        "Open Chats",
      );
    if (activeTab === "courses") return renderCourses();
    if (activeTab === "students") return renderStudents();
    if (activeTab === "study-materials") return renderStudyMaterials();
    if (activeTab === "attendance")
      return renderActionPanel(
        "Attendance",
        "Track and manage attendance sessions.",
        "/teacher-attendance",
        "Open Attendance",
      );
    if (activeTab === "timetable") return renderTimetable();
    if (activeTab === "exams") return renderExams();
    return renderOverview();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <SkeletonCards count={4} />
        <Skeleton className="h-11 w-full" />
        <SkeletonRows rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${teacherName}`}
        description={`${department || "Department"} • ${todayName}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Today's Classes"
          value={todaysClasses.length}
          icon={CalendarDays}
          tone="brand"
          hint={todayName}
        />
        <StatCard
          label="Weekly Classes"
          value={upcomingClasses}
          icon={CalendarRange}
          tone="info"
        />
        <StatCard
          label="Active Announcements"
          value={unreadAnnouncements}
          icon={Bell}
          tone="warning"
        />
        <StatCard
          label="Assigned Courses"
          value={teacherAssignments.length}
          icon={BookOpen}
          tone="success"
        />
      </div>

      <Tabs
        items={navItems.map((item) => ({ value: item.id, label: item.label }))}
        value={activeTab}
        onChange={(value) => setActiveTab(value)}
      />

      <div>{renderActivePanel()}</div>
    </div>
  );
}

export default TeacherDashboard;
