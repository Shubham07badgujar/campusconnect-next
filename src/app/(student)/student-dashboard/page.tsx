"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { firestore, auth } from "@/lib/client/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  doc,
  getDoc,
  orderBy,
  limit,
} from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import {
  FiAlertCircle,
  FiCalendar,
  FiBook,
  FiBell,
  FiClock,
  FiCheck,
  FiBarChart2,
  FiMapPin,
  FiUser,
  FiChevronRight,
  FiChevronDown,
  FiGrid,
  FiFileText,
  FiUsers,
} from "react-icons/fi";
import { useRouter } from "next/navigation";
import {
  getStudentAttendance,
  getActiveAttendanceSessions,
} from "@/lib/client/attendanceService";
import FixItBoard from "@/components/common/FixItBoard";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";
import {
  TableWrap,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/Table";
import { EmptyState, Skeleton, SkeletonCards } from "@/components/ui/States";

const makeSubjectId = (subjectName = "") =>
  String(subjectName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const formatDateTime = (value: any) => {
  if (!value) return "";
  if (typeof value?.toDate === "function")
    return value.toDate().toLocaleString();
  if (typeof value?.seconds === "number")
    return new Date(value.seconds * 1000).toLocaleString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString();
};

const normalizeYearToken = (value = "") =>
  String(value || "").replace(/[^0-9]/g, "");

const toLocalDateKey = (value: any) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

const branchMappings: any = {
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
  return aliases.some((alias: any) => exam.includes(alias));
};

const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function StudentDashboard() {
  const router = useRouter();
  const [user] = useAuthState(auth);
  const [studentName, setStudentName] = useState("");
  const [department, setDepartment] = useState("");
  const [year, setYear] = useState("");
  const [semester, setSemester] = useState("");
  const [division, setDivision] = useState("");
  const [courses, setCourses] = useState<any[]>([]);
  const [subjectTeachersMap, setSubjectTeachersMap] = useState<any>({});
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [todaysClasses, setTodaysClasses] = useState<any[]>([]);
  const [attendanceStatsBySubject, setAttendanceStatsBySubject] = useState<any>(
    {},
  );
  const [attendanceRefreshing, setAttendanceRefreshing] = useState(false);
  const [studyMaterials, setStudyMaterials] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [activeSessionsRefreshing, setActiveSessionsRefreshing] =
    useState(false);
  const [examSchedule, setExamSchedule] = useState<any[]>([]);
  const [examTimetablePdf, setExamTimetablePdf] = useState<any>(null);
  const [examCalendarMonth, setExamCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [eventsCalendar, setEventsCalendar] = useState<any[]>([]);
  const [academicCalendar, setAcademicCalendar] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("overview");

  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const today = daysOfWeek[new Date().getDay()];

  const subjectColors = [
    { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-700" },
    {
      bg: "bg-purple-100",
      border: "border-purple-300",
      text: "text-purple-700",
    },
    { bg: "bg-green-100", border: "border-green-300", text: "text-green-700" },
    {
      bg: "bg-orange-100",
      border: "border-orange-300",
      text: "text-orange-700",
    },
    { bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-700" },
    { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-700" },
  ];

  const getSubjectColor = (index: any) =>
    subjectColors[index % subjectColors.length];

  const subjectColorClasses = [
    "bg-blue-100 border-blue-300 text-blue-700",
    "bg-purple-100 border-purple-300 text-purple-700",
    "bg-green-100 border-green-300 text-green-700",
    "bg-orange-100 border-orange-300 text-orange-700",
    "bg-pink-100 border-pink-300 text-pink-700",
    "bg-teal-100 border-teal-300 text-teal-700",
    "bg-indigo-100 border-indigo-300 text-indigo-700",
  ];

  const getSubjectColorByName = (subjectName = "") => {
    const seed = String(subjectName || "")
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return subjectColorClasses[seed % subjectColorClasses.length];
  };

  const refreshAttendanceSummary = async (studentId: any, options: any = {}) => {
    const targetStudentId = String(studentId || "").trim();
    if (!targetStudentId) {
      return;
    }

    const silent = Boolean(options?.silent);
    setAttendanceRefreshing(true);
    try {
      const attendanceResult = await getStudentAttendance(targetStudentId);
      const stats = Array.isArray(attendanceResult.attendance)
        ? attendanceResult.attendance
        : [];
      const statsMap: any = {};
      stats.forEach((entry: any) => {
        const byId = String(entry.subjectId || "");
        const byName = makeSubjectId(entry.subjectName || "");
        if (byId) statsMap[byId] = entry;
        if (byName) statsMap[byName] = entry;
      });
      setAttendanceStatsBySubject(statsMap);
    } catch (error) {
      if (!silent) {
        console.error("Error refreshing attendance summary:", error);
      }
    } finally {
      setAttendanceRefreshing(false);
    }
  };

  const calculateNeededClassesFor75 = (attended = 0, total = 0) => {
    const attendedNum = Number(attended || 0);
    const totalNum = Number(total || 0);
    if (totalNum <= 0) return 0;
    if (attendedNum / totalNum >= 0.75) return 0;

    const required = Math.ceil((0.75 * totalNum - attendedNum) / 0.25);
    return Math.max(required, 0);
  };

  const navItems = useMemo(
    () => [
      { id: "overview", label: "Overview", icon: FiGrid },
      { id: "announcements", label: "Announcements", icon: FiBell },
      { id: "fixit", label: "FixIt", icon: FiAlertCircle },
      { id: "study-materials", label: "Study Materials", icon: FiBook },
      { id: "calendars", label: "Calendars", icon: FiCalendar },
      { id: "attendance", label: "Attendance", icon: FiCheck },
      { id: "exam", label: "Exam Schedule", icon: FiFileText },
      { id: "timetable", label: "Full Timetable", icon: FiClock },
    ],
    [],
  );

  const refreshActiveSessions = useCallback(
    async ({ silent = false } = {}) => {
      if (!user) {
        return;
      }

      if (!silent) {
        setActiveSessionsRefreshing(true);
      }

      try {
        const response = await getActiveAttendanceSessions();
        setActiveSessions(
          Array.isArray(response.sessions) ? response.sessions : [],
        );
      } catch (error) {
        if (!silent) {
          console.error("Error refreshing active attendance sessions:", error);
        }
        setActiveSessions([]);
      } finally {
        if (!silent) {
          setActiveSessionsRefreshing(false);
        }
      }
    },
    [user],
  );

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }

    const fetchStudentData = async () => {
      try {
        const userDocRef = doc(firestore, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        let studentData: any = null;
        if (userDocSnap.exists()) {
          studentData = userDocSnap.data();
        } else {
          const q = query(
            collection(firestore, "users"),
            where("uid", "==", user.uid),
          );
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            studentData = querySnapshot.docs[0].data();
          }
        }

        if (studentData) {
          const resolvedDept =
            studentData.dept || studentData.department || "Not assigned";
          const resolvedYear = studentData.year || "";
          const resolvedSemester = studentData.semester || "";

          setStudentName(
            studentData.name || studentData.displayName || "Student",
          );
          setDepartment(resolvedDept);
          setYear(resolvedYear);
          setSemester(resolvedSemester);
          setDivision(studentData.division || "A");

          // Show dashboard shell first, then hydrate heavier sections in background.
          setLoading(false);

          if (resolvedDept && resolvedYear && resolvedSemester) {
            fetchTimetable(resolvedDept, resolvedYear, resolvedSemester);
          }

          const assignedSubjects = Array.isArray(studentData.subjects)
            ? studentData.subjects
            : [];
          setCourses(
            assignedSubjects.map((subject: any, index: any) => ({
              id: index + 1,
              name: subject,
            })),
          );

          if (assignedSubjects.length > 0 && resolvedDept && resolvedYear) {
            fetchTeachersForSubjects(
              resolvedDept,
              resolvedYear,
              assignedSubjects,
            );
          } else {
            setSubjectTeachersMap({});
          }

          refreshAttendanceSummary(user.uid, { silent: true });
        }
      } catch (error) {
        console.error("Error fetching student data:", error);
      } finally {
        setLoading(false);
      }
    };

    const fetchTimetable = async (branch: any, academicYear: any, sem: any) => {
      try {
        const timetableRef = collection(firestore, "timetables");
        const q = query(
          timetableRef,
          where("branch", "==", branch),
          where("year", "==", academicYear),
          where("semester", "==", sem),
        );

        const querySnapshot = await getDocs(q);
        const allClasses = querySnapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a: any, b: any) =>
            String(a.startTime || "00:00").localeCompare(
              String(b.startTime || "00:00"),
            ),
          );

        setTimetable(allClasses);
        setTodaysClasses(
          allClasses.filter((classInfo: any) => classInfo.day === today),
        );
      } catch (error) {
        console.error("Error fetching timetable:", error);
      }
    };

    const fetchTeachersForSubjects = async (
      studentDept: any,
      studentYear: any,
      assignedSubjects: any,
    ) => {
      try {
        const teacherSnapshot = await getDocs(
          collection(firestore, "teachers"),
        );
        const nextMap: any = {};

        assignedSubjects.forEach((subject: any) => {
          nextMap[subject] = [];
        });

        teacherSnapshot.docs.forEach((teacherDoc) => {
          const teacherData: any = teacherDoc.data() || {};
          const teacherName =
            teacherData.name ||
            teacherData.fullName ||
            teacherData.displayName ||
            "Teacher";
          const teacherId =
            teacherData.teacherId || teacherData.employeeId || "";
          const teacherLabel = teacherId
            ? `${teacherName} (${teacherId})`
            : teacherName;

          const assignments =
            Array.isArray(teacherData.assignments) &&
            teacherData.assignments.length > 0
              ? teacherData.assignments
              : [];

          assignments.forEach((assignment: any) => {
            const sameBranch =
              String(assignment.branch || "")
                .trim()
                .toLowerCase() ===
              String(studentDept || "")
                .trim()
                .toLowerCase();
            const sameYear =
              String(assignment.year || "")
                .trim()
                .toLowerCase() ===
              String(studentYear || "")
                .trim()
                .toLowerCase();

            if (!sameBranch || !sameYear) return;

            assignedSubjects.forEach((subject: any) => {
              if ((assignment.subjects || []).includes(subject)) {
                nextMap[subject].push(teacherLabel);
              }
            });
          });
        });

        Object.keys(nextMap).forEach((subject) => {
          nextMap[subject] = [...new Set(nextMap[subject])];
        });

        setSubjectTeachersMap(nextMap);
      } catch (error) {
        console.error("Error fetching teacher-subject associations:", error);
        setSubjectTeachersMap({});
      }
    };

    const announcementsQuery = query(
      collection(firestore, "announcements"),
      where("active", "==", true),
    );

    const unsubscribeAnnouncements = onSnapshot(
      announcementsQuery,
      (snapshot) => {
        const list = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
            isRead: item.data().readBy?.includes(user.uid) || false,
          }))
          .sort((a: any, b: any) => {
            const timeA = a.createdAt?.toMillis?.() || 0;
            const timeB = b.createdAt?.toMillis?.() || 0;
            return timeB - timeA;
          });

        setAnnouncements(list);
      },
    );

    const materialsQuery = query(
      collection(firestore, "studyMaterials"),
      orderBy("createdAt", "desc"),
      limit(20),
    );

    const unsubscribeMaterials = onSnapshot(
      materialsQuery,
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setStudyMaterials(list);
      },
      (error) => {
        console.error("Error fetching study materials:", error);
        setStudyMaterials([]);
      },
    );

    const eventsQuery = query(
      collection(firestore, "events"),
      orderBy("startDate"),
      limit(10),
    );
    const unsubscribeEvents = onSnapshot(
      eventsQuery,
      (snapshot) => {
        setEventsCalendar(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
      },
      () => {
        setEventsCalendar([]);
      },
    );

    const academicQuery = query(
      collection(firestore, "academicCalendar"),
      orderBy("startDate"),
      limit(10),
    );
    const unsubscribeAcademic = onSnapshot(
      academicQuery,
      (snapshot) => {
        setAcademicCalendar(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
      },
      () => {
        setAcademicCalendar([]);
      },
    );

    fetchStudentData();

    return () => {
      unsubscribeAnnouncements();
      unsubscribeMaterials();
      unsubscribeEvents();
      unsubscribeAcademic();
    };
  }, [user, router, today]);

  useEffect(() => {
    if (!user || !department || !year) {
      setExamSchedule([]);
      setExamTimetablePdf(null);
      return () => {};
    }

    const studentYearToken = normalizeYearToken(year);

    const unsubscribeExams = onSnapshot(
      collection(firestore, "examTimetable"),
      (snapshot) => {
        const filtered = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((exam: any) => {
            if (exam?.isActive === false) {
              return false;
            }

            const yearMatch =
              !studentYearToken ||
              normalizeYearToken(exam.year || "") === studentYearToken;
            const branchMatch = branchMatches(exam.branch || "", department);
            return yearMatch && branchMatch;
          })
          .sort((a: any, b: any) => {
            const dateA = parseExamDate(a.date || "");
            const dateB = parseExamDate(b.date || "");
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;

            const dateDiff = dateA.getTime() - dateB.getTime();
            if (dateDiff !== 0) return dateDiff;

            return String(a.time || "").localeCompare(String(b.time || ""));
          });

        setExamSchedule(filtered);
      },
      (error) => {
        console.error("Error subscribing exam schedule:", error);
        setExamSchedule([]);
      },
    );

    const unsubscribeExamPdf = onSnapshot(
      collection(firestore, "exam_timetable_files"),
      (snapshot) => {
        const activeFiles = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((file: any) => {
            if (file?.active === false) {
              return false;
            }
            return normalizeYearToken(file.year || "") === studentYearToken;
          })
          .sort((a: any, b: any) => {
            const aMs =
              a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
            const bMs =
              b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
            return bMs - aMs;
          });

        setExamTimetablePdf(activeFiles[0] || null);
      },
      (error) => {
        console.error("Error subscribing timetable PDF:", error);
        setExamTimetablePdf(null);
      },
    );

    return () => {
      unsubscribeExams();
      unsubscribeExamPdf();
    };
  }, [user, department, year]);

  useEffect(() => {
    if (!user) return;

    refreshActiveSessions({ silent: true });
    const timer = setInterval(
      () => refreshActiveSessions({ silent: true }),
      30000,
    );

    return () => {
      clearInterval(timer);
    };
  }, [user, refreshActiveSessions]);

  useEffect(() => {
    if (!examSchedule.length) {
      return;
    }

    const upcoming = examSchedule
      .map((exam) => parseExamDate(exam.date || ""))
      .filter(Boolean)
      .sort((a: any, b: any) => a.getTime() - b.getTime())[0];

    if (upcoming) {
      setExamCalendarMonth(
        new Date(upcoming.getFullYear(), upcoming.getMonth(), 1),
      );
    }
  }, [examSchedule]);

  const formatTime = (time: any) => {
    if (!time) return "";
    const [hours, minutes] = String(time).split(":");
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const formattedHour = hour % 12 || 12;
    return `${formattedHour}:${minutes} ${ampm}`;
  };

  const unreadAnnouncements = announcements.filter(
    (item) => !item.isRead,
  ).length;

  const attendanceList: any[] = Object.values(attendanceStatsBySubject);
  const overallAttendance =
    attendanceList.length > 0
      ? attendanceList.reduce(
          (acc, item) => acc + Number(item?.percentage || 0),
          0,
        ) / attendanceList.length
      : 0;

  const nameInitials = String(studentName || "S")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase())
    .join("");

  const filteredStudyMaterials = useMemo(
    () =>
      studyMaterials.filter((item) => {
        if (!department || !item.department) return true;
        return (
          String(item.department).trim().toLowerCase() ===
          String(department).trim().toLowerCase()
        );
      }),
    [studyMaterials, department],
  );

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

  const getClassesForSlot = (day: any, timeSlot: any) =>
    timetable.filter((item) => {
      const start = String(item.startTime || "");
      const end = String(item.endTime || "");
      return item.day === day && start <= timeSlot && end > timeSlot;
    });

  const quickActions = [
    { label: "Mark Attendance", icon: FiCheck, route: "/student-attendance" },
    { label: "Full Timetable", icon: FiClock, route: "/student-timetable" },
    { label: "Calendars", icon: FiCalendar, route: "/calendars" },
    { label: "Exam Timetable", icon: FiFileText, route: "/exam-timetable" },
  ];

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Classes Today"
          value={todaysClasses.length}
          icon={FiClock}
          tone="brand"
        />
        <StatCard
          label="Weekly Classes"
          value={timetable.length}
          icon={FiCalendar}
          tone="success"
        />
        <StatCard
          label="Attendance"
          value={`${overallAttendance.toFixed(0)}%`}
          icon={FiBarChart2}
          tone={
            overallAttendance >= 75
              ? "success"
              : overallAttendance >= 50
                ? "warning"
                : "danger"
          }
        />
        <StatCard
          label="New Alerts"
          value={unreadAnnouncements}
          icon={FiBell}
          tone="info"
        />
      </div>

      <Card>
        <CardHeader
          title="Quick Actions"
          description="Jump straight to what you need."
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.route}
                  variant="secondary"
                  className="h-auto flex-col gap-2 py-4"
                  onClick={() => router.push(action.route)}
                >
                  <Icon className="h-5 w-5 text-brand-600" />
                  {action.label}
                </Button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Today's Schedule" />
        <CardBody className="space-y-3">
          {todaysClasses.length > 0 ? (
            todaysClasses.map((classItem, index) => {
              const colors = subjectColors[index % subjectColors.length];
              return (
                <div
                  key={classItem.id}
                  className={`rounded-2xl border ${colors.border} ${colors.bg} p-4`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex-1">
                      <h3 className={`text-lg font-semibold ${colors.text}`}>
                        {classItem.subjectName || classItem.subject}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm text-ink-soft">
                        <span className="flex items-center gap-1">
                          <FiClock className="h-4 w-4" />
                          {formatTime(classItem.startTime)} -{" "}
                          {formatTime(classItem.endTime)}
                        </span>
                        {classItem.room ? (
                          <span className="flex items-center gap-1">
                            <FiMapPin className="h-4 w-4" />
                            {classItem.room}
                          </span>
                        ) : null}
                        {classItem.teacherName ? (
                          <span className="flex items-center gap-1">
                            <FiUser className="h-4 w-4" />
                            {classItem.teacherName}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyState
              icon={FiCalendar}
              title="No classes today"
              description="Enjoy your day — nothing is scheduled."
            />
          )}
        </CardBody>
      </Card>
    </div>
  );

  const renderAnnouncements = () => (
    <Card>
      <CardHeader
        title="Announcements"
        description="All active campus updates in one place."
        actions={<Badge tone="info">Unread: {unreadAnnouncements}</Badge>}
      />
      <CardBody>
        {announcements.length > 0 ? (
          <div className="space-y-3">
            {announcements.map((item) => (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 ${item.isRead ? "border-line bg-slate-50/70" : "border-brand-200 bg-brand-50"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-ink">
                      {item.title || "Announcement"}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">
                      {item.message || "No details available."}
                    </p>
                  </div>
                  <Badge tone="neutral">{item.type || "general"}</Badge>
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  {formatDateTime(item.createdAt)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FiBell}
            title="No announcements yet"
            description="Campus updates will show up here."
          />
        )}
      </CardBody>
    </Card>
  );

  const renderStudyMaterials = () => (
    <Card>
      <CardHeader
        title="Study Materials"
        description="Latest materials from faculty and peers."
      />
      <CardBody>
        {filteredStudyMaterials.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filteredStudyMaterials.map((material) => (
              <div
                key={material.id}
                className="rounded-2xl border border-line bg-slate-50/70 p-4"
              >
                <p className="text-base font-semibold text-ink">
                  {material.title || "Untitled"}
                </p>
                {material.subject ? (
                  <p className="mt-1 text-xs text-ink-faint">
                    Subject: {material.subject}
                  </p>
                ) : null}
                {material.description ? (
                  <p className="mt-2 line-clamp-3 text-sm text-ink-soft">
                    {material.description}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-ink-faint">
                    By {material.uploadedByName || "Faculty"}
                  </p>
                  {material.fileURL ? (
                    <a
                      href={material.fileURL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      View
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FiBook}
            title="No study materials found"
            description="Nothing has been shared for your department yet."
          />
        )}
      </CardBody>
    </Card>
  );

  const renderCalendars = () => (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink">
                Main Calendar Hub
              </h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                Open dedicated calendar module with dashboard-aware back
                navigation.
              </p>
            </div>
            <Button onClick={() => router.push("/calendars")}>
              Open Main Calendars <FiChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <FiCalendar className="h-3.5 w-3.5" />
                </span>
                Events Calendar
              </span>
            }
          />
          <CardBody>
            {eventsCalendar.length > 0 ? (
              <div className="space-y-3">
                {eventsCalendar.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-2xl border border-line bg-slate-50/70 p-4"
                  >
                    <p className="font-semibold text-ink">
                      {event.title || "Event"}
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {event.startDate || "-"}
                      {event.startTime ? ` • ${event.startTime}` : ""}
                      {event.location ? ` • ${event.location}` : ""}
                    </p>
                    {event.description ? (
                      <p className="mt-2 line-clamp-3 text-sm text-ink-soft">
                        {event.description}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FiCalendar}
                title="No events"
                description="No events available right now."
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <FiBook className="h-3.5 w-3.5" />
                </span>
                Academic Calendar
              </span>
            }
          />
          <CardBody>
            {academicCalendar.length > 0 ? (
              <div className="space-y-3">
                {academicCalendar.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-line bg-slate-50/70 p-4"
                  >
                    <p className="font-semibold text-ink">
                      {item.activity || item.title || "Academic Event"}
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {item.startDate || item.dateSlots || "Date not available"}
                    </p>
                    {item.responsibility ? (
                      <p className="mt-2 text-sm text-ink-soft">
                        {item.responsibility}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FiBook}
                title="No academic items"
                description="No academic calendar items available."
              />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );

  const renderAttendance = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <FiCheck className="h-3.5 w-3.5" />
              </span>
              Active Attendance Sessions
            </span>
          }
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refreshActiveSessions({ silent: false })}
              disabled={activeSessionsRefreshing || !user?.uid}
            >
              {activeSessionsRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
          }
        />
        <CardBody>
          {activeSessions.length > 0 ? (
            <div className="space-y-3">
              {activeSessions.map((session) => (
                <div
                  key={session.sessionId || session.id}
                  className="rounded-2xl border border-line bg-slate-50/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">
                        {session.subjectName || "Subject"}
                      </p>
                      <p className="mt-1 text-sm text-ink-soft">
                        {session.teacherName || "Teacher"} •{" "}
                        {session.day || "-"} •{" "}
                        {session.lectureStartTime || "--:--"} -{" "}
                        {session.lectureEndTime || "--:--"}
                      </p>
                      <p className="mt-1 text-xs text-ink-faint">
                        {session.branch || "-"} {session.year || ""}
                        {session.semester ? ` / Sem ${session.semester}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => {
                        const sessionId = String(
                          session.sessionId || session.id || "",
                        ).trim();
                        if (!sessionId) {
                          return;
                        }
                        router.push(
                          `/student-attendance?sessionId=${encodeURIComponent(sessionId)}`,
                        );
                      }}
                    >
                      Join Session
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FiCheck}
              title="No active sessions"
              description="No active attendance sessions currently."
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <FiBarChart2 className="h-3.5 w-3.5" />
              </span>
              Subject Attendance Summary
            </span>
          }
          actions={
            <Button
              variant="secondary"
              size="sm"
              disabled={attendanceRefreshing || !user?.uid}
              onClick={() => refreshAttendanceSummary(user?.uid)}
            >
              {attendanceRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
          }
        />
        <CardBody>
          {courses.length > 0 ? (
            <div className="space-y-4">
              {courses.map((course) => {
              const stats =
                attendanceStatsBySubject[makeSubjectId(course.name)] || {};
              const attended = Number(stats.attendedClasses || 0);
              const total = Number(stats.totalClasses || 0);
              const absent = Math.max(total - attended, 0);
              const percentage = Number(stats.percentage || 0);
              const needed = calculateNeededClassesFor75(attended, total);
              const safePercentage = Math.min(Math.max(percentage, 0), 100);

              return (
                <div
                  key={course.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-slate-800">
                        {course.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {subjectTeachersMap[course.name] &&
                        subjectTeachersMap[course.name].length > 0
                          ? subjectTeachersMap[course.name].join(", ")
                          : "Teacher not assigned yet"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        percentage >= 75
                          ? "bg-emerald-100 text-emerald-700"
                          : percentage >= 50
                            ? "bg-amber-100 text-amber-700"
                            : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {percentage.toFixed(1)}%
                    </span>
                  </div>

                  <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full ${
                        percentage >= 75
                          ? "bg-emerald-500"
                          : percentage >= 50
                            ? "bg-amber-500"
                            : "bg-rose-500"
                      }`}
                      style={{ width: `${safePercentage}%` }}
                    />
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-[11px] uppercase text-slate-500">
                        Attended
                      </p>
                      <p className="text-sm font-semibold text-slate-800">
                        {attended}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-[11px] uppercase text-slate-500">
                        Absent
                      </p>
                      <p className="text-sm font-semibold text-slate-800">
                        {absent}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-[11px] uppercase text-slate-500">
                        Total
                      </p>
                      <p className="text-sm font-semibold text-slate-800">
                        {total}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-[11px] uppercase text-slate-500">
                        Need For 75%
                      </p>
                      <p className="text-sm font-semibold text-slate-800">
                        {needed > 0 ? `${needed} classes` : "Reached"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-xs font-medium text-slate-600">
                      Attendance Graph (Present vs Absent)
                    </p>
                    <div className="flex h-28 items-end gap-4">
                      <div className="flex flex-1 flex-col items-center">
                        <div className="flex h-20 w-12 items-end rounded bg-emerald-100 p-1">
                          <div
                            className="w-full rounded bg-emerald-500"
                            style={{
                              height: `${total > 0 ? Math.max((attended / total) * 100, 6) : 6}%`,
                            }}
                          />
                        </div>
                        <p className="mt-2 text-[11px] text-slate-600">
                          Present
                        </p>
                      </div>
                      <div className="flex flex-1 flex-col items-center">
                        <div className="flex h-20 w-12 items-end rounded bg-rose-100 p-1">
                          <div
                            className="w-full rounded bg-rose-500"
                            style={{
                              height: `${total > 0 ? Math.max((absent / total) * 100, 6) : 6}%`,
                            }}
                          />
                        </div>
                        <p className="mt-2 text-[11px] text-slate-600">
                          Absent
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          ) : (
            <EmptyState
              icon={FiBarChart2}
              title="No attendance data"
              description="No attendance data available."
            />
          )}
        </CardBody>
      </Card>
    </div>
  );

  const renderExamSchedule = () => (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <FiFileText className="h-3.5 w-3.5" />
            </span>
            Exam Schedule
          </span>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push("/exam-timetable")}
          >
            Open Full View <FiChevronRight className="h-4 w-4" />
          </Button>
        }
      />
      <CardBody>
      {examTimetablePdf ? (
        <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-3">
          <p className="text-sm font-semibold text-slate-800">
            Official Timetable PDF
          </p>
          <a
            href={examTimetablePdf.fileURL}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#2f87d9] px-3 py-1.5 text-xs font-medium text-white"
          >
            Open {year || "Year"} PDF <FiChevronRight className="h-3.5 w-3.5" />
          </a>
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
            examRows.forEach((exam: any) => {
              const key = toLocalDateKey(exam.parsedDate);
              if (!examMap.has(key)) {
                examMap.set(key, []);
              }
              examMap.get(key).push(exam);
            });

            const firstWeekday = monthStart.getDay();
            const totalDays = monthEnd.getDate();
            const cells: any[] = [];

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
                            {cell.exams.slice(0, 2).map((exam: any) => (
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
                              {cell.exams.map((exam: any) => (
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
                                    {exam.duration ? ` • ${exam.duration}` : ""}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    {exam.branch || "Branch"}
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
          title="No exams published"
          description="No exams published yet for your class."
        />
      )}
      </CardBody>
    </Card>
  );

  const renderFullTimetable = () => (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <FiClock className="h-3.5 w-3.5" />
            </span>
            Full Timetable
          </span>
        }
      />
      <CardBody>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-slate-50/70 p-3">
          <p className="text-xs uppercase tracking-wide text-ink-faint">
            Department
          </p>
          <p className="mt-1 font-semibold text-ink">
            {department || "-"}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-slate-50/70 p-3">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Year</p>
          <p className="mt-1 font-semibold text-ink">{year || "-"}</p>
        </div>
        <div className="rounded-2xl border border-line bg-slate-50/70 p-3">
          <p className="text-xs uppercase tracking-wide text-ink-faint">
            Semester
          </p>
          <p className="mt-1 font-semibold text-ink">{semester || "-"}</p>
        </div>
      </div>

      {timetable.length > 0 ? (
        <TableWrap className="min-w-full">
          <Table className="min-w-[880px]">
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="text-left">Time</TH>
                {dayOrder.map((day) => (
                  <TH key={day} className="text-center">
                    {day}
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {timeSlots.map((slot) => {
                const isAfterLunch = slot === "14:00";

                return (
                  <React.Fragment key={slot}>
                    {isAfterLunch ? (
                      <TR className="hover:bg-transparent">
                        <TD className="bg-amber-50 text-xs font-semibold text-amber-700">
                          13:30 - 14:15
                        </TD>
                        <TD
                          colSpan={dayOrder.length}
                          className="bg-amber-50 text-center text-xs font-semibold text-amber-700"
                        >
                          Recess
                        </TD>
                      </TR>
                    ) : null}

                    <TR>
                      <TD className="bg-slate-50/70 font-medium text-ink-soft">
                        {slot}
                      </TD>
                      {dayOrder.map((day) => {
                        const slotClasses = getClassesForSlot(day, slot);
                        return (
                          <TD key={`${day}_${slot}`} className="align-top">
                            {slotClasses.map((classItem) => {
                              const subjectName =
                                classItem.subjectName ||
                                classItem.subject ||
                                "Subject";
                              const colors = getSubjectColorByName(subjectName);
                              return (
                                <div
                                  key={classItem.id}
                                  className={`mb-1 rounded-lg border p-2 ${colors}`}
                                >
                                  <p className="text-xs font-semibold">
                                    {subjectName}
                                  </p>
                                  <p className="mt-1 text-[11px] text-ink-soft">
                                    {classItem.startTime} - {classItem.endTime}
                                  </p>
                                  {classItem.teacherName ? (
                                    <p className="text-[11px] text-ink-soft">
                                      {classItem.teacherName}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })}
                          </TD>
                        );
                      })}
                    </TR>
                  </React.Fragment>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      ) : (
        <EmptyState
          icon={FiClock}
          title="No classes found"
          description="No classes found for your current profile."
        />
      )}
      </CardBody>
    </Card>
  );

  const renderActivePanel = () => {
    if (activeTab === "overview") return renderOverview();
    if (activeTab === "announcements") return renderAnnouncements();
    if (activeTab === "fixit")
      return <FixItBoard role="student" displayName={studentName} />;
    if (activeTab === "study-materials") return renderStudyMaterials();
    if (activeTab === "calendars") return renderCalendars();
    if (activeTab === "attendance") return renderAttendance();
    if (activeTab === "exam") return renderExamSchedule();
    if (activeTab === "timetable") return renderFullTimetable();
    return renderOverview();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full max-w-md" />
        <SkeletonCards count={4} />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${studentName || "Student"}`}
        description={
          <>
            {department || "Department"} • {year || "-"} Year{" "}
            {semester ? `• Sem ${semester}` : ""}
            {division ? ` • Div ${division}` : ""}
          </>
        }
        actions={
          <Badge tone="brand">
            <FiCalendar className="h-3.5 w-3.5" />
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </Badge>
        }
      />

      <Tabs
        items={navItems.map((item) => {
          const Icon = item.icon;
          return {
            value: item.id,
            label: (
              <span className="flex items-center gap-1.5">
                <Icon className="h-4 w-4" /> {item.label}
              </span>
            ),
          };
        })}
        value={activeTab}
        onChange={(value) => setActiveTab(value)}
      />

      <div>{renderActivePanel()}</div>
    </div>
  );
}

export default StudentDashboard;
