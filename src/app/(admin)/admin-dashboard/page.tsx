"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { auth, firestore } from "@/lib/client/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

// Icons
import {
  FiAlertCircle,
  FiLogOut,
  FiUser,
  FiUsers,
  FiHome,
  FiBell,
  FiCalendar,
  FiCreditCard,
  FiSettings,
  FiUpload,
  FiLayers,
  FiEdit3,
  FiChevronRight,
} from "react-icons/fi";
import CalendarComponent from "@/components/common/CalendarComponent";
import FixItBoard from "@/components/common/FixItBoard";

import PageHeader from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
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
import { EmptyState } from "@/components/ui/States";

// Presentational helper: department breakdown string from an already-read map.
const deptBreakdown = (byDept: Record<string, number> = {}) =>
  Object.entries(byDept)
    .filter(([, count]: any) => count > 0)
    .map(([dept, count]) => `${dept}: ${count}`)
    .join(", ");

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [examTimetable, setExamTimetable] = useState([]);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const router = useRouter();

  const [studentStats, setStudentStats] = useState({ total: 0, byDept: {} });
  const [teacherStats, setTeacherStats] = useState({ total: 0, byDept: {} });

  // Define fetchUsers first, before using it in useEffect
  const fetchUsers = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(collection(firestore, "users"));
      const userList = [];
      querySnapshot.forEach((docSnap) => {
        userList.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      setUsers(userList);
    } catch (err) {
      setError("Failed to fetch users: " + err.message);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      // Fetch students
      const usersSnapshot = await getDocs(collection(firestore, "users"));
      const students = usersSnapshot.docs
        .map((doc) => doc.data())
        .filter((u) => (u.role || "Student") === "Student");
      const studentByDept = {};
      students.forEach((u) => {
        const dept = (u.dept || "Other").trim();
        studentByDept[dept] = (studentByDept[dept] || 0) + 1;
      });
      setStudentStats({
        total: students.length,
        byDept: studentByDept,
      });

      // Fetch teachers
      const teachersSnapshot = await getDocs(collection(firestore, "teachers"));
      const teachersData = teachersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
      setTeachers(teachersData);
      const teacherByDept = {};
      teachersData.forEach((t) => {
        const dept = (t.dept || "Other").trim();
        teacherByDept[dept] = (teacherByDept[dept] || 0) + 1;
      });
      setTeacherStats({
        total: teachersData.length,
        byDept: teacherByDept,
      });
    } catch (err) {
      // Optionally handle error
    }
  }, []);

  const fetchCenterPanelData = useCallback(async () => {
    try {
      const [announcementSnapshot, examSnapshot] = await Promise.all([
        getDocs(collection(firestore, "announcements")),
        getDocs(collection(firestore, "examTimetable")),
      ]);

      const announcementList = announcementSnapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
        .sort((a, b) => {
          const aSec = a?.createdAt?.seconds || 0;
          const bSec = b?.createdAt?.seconds || 0;
          return bSec - aSec;
        });
      setAnnouncements(announcementList);

      const examList = examSnapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
        .sort((a, b) =>
          String(a.date || "").localeCompare(String(b.date || "")),
        );
      setExamTimetable(examList);
    } catch (err) {
      console.error("Failed to load center panel data:", err);
    }
  }, []);

  const studentOnlyUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          (u.role || "Student") === "Student" ||
          (!u.role && (u.rollNo || u.rollNumber)),
      ),
    [users],
  );

  useEffect(() => {
    // Local flag to prevent state updates after unmount
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Only proceed if component is still mounted
      if (!isMounted) return;

      if (currentUser) {
        try {
          // Force refresh the token to ensure latest custom claims
          const tokenResult = await currentUser.getIdTokenResult(true);

          // Only navigate if component is still mounted
          if (!isMounted) return;

          if (!tokenResult.claims.admin) {
            router.push("/auth/admin");
          } else {
            // Only fetch users if still mounted
            fetchUsers();
            fetchStats();
            fetchCenterPanelData();
          }
        } catch (error) {
          console.error("Token error:", error);
          if (isMounted) {
            router.push("/auth/admin");
          }
        }
      } else if (isMounted) {
        router.push("/auth/admin");
      }
    });

    // Enhanced cleanup
    return () => {
      isMounted = false; // Mark as unmounted
      unsubscribe(); // Clean up auth listener
    };
  }, [router, fetchUsers, fetchStats, fetchCenterPanelData]);

  // Simplified logout function to prevent errors
  const handleLogout = () => {
    setTimeout(() => {
      try {
        // Sign out and navigate
        auth.signOut();
        router.push("/login");
      } catch (err) {
        console.error("Logout error:", err);
      }
    }, 10);
  };

  const navItems = [
    { id: "overview", label: "Overview", icon: FiHome },
    {
      id: "students",
      label: "Students",
      icon: FiUsers,
      route: "/admin/usermanagement",
    },
    {
      id: "teachers",
      label: "Teachers",
      icon: FiUser,
      route: "/admin/teachermanagement",
    },
    {
      id: "subject-sets",
      label: "Subject Sets",
      icon: FiLayers,
      route: "/admin/subject-sets",
    },
    {
      id: "upload",
      label: "Upload Students",
      icon: FiUpload,
      route: "/admin/upload-students",
    },
    {
      id: "bulk-update",
      label: "Bulk Academic Update",
      icon: FiEdit3,
      route: "/admin/bulk-academic-update",
    },
    {
      id: "announcements",
      label: "Announcements",
      icon: FiBell,
      route: "/admin/announcements",
    },
    {
      id: "fixit",
      label: "FixIt",
      icon: FiAlertCircle,
    },
    {
      id: "calendars",
      label: "Calendars",
      icon: FiCalendar,
      route: "/calendars",
    },
    {
      id: "exam-timetable",
      label: "Exam Timetable",
      icon: FiCreditCard,
      route: "/admin/exam-timetable",
    },
    {
      id: "settings",
      label: "Settings",
      icon: FiSettings,
      route: "/admin/settings",
    },
  ];

  const openNavItem = (item) => {
    setActiveTab(item.id);
  };

  const adminName = auth.currentUser?.displayName || "Administrator";

  const renderOverview = () => (
    <div className="space-y-6">
      <Card className="animate-fade-up">
        <CardBody className="px-6 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ink-faint">
            Admin Workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {adminName}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">Campus Control Center</p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Students"
          value={studentStats.total}
          icon={FiUsers}
          tone="brand"
          hint={deptBreakdown(studentStats.byDept) || undefined}
        />
        <StatCard
          label="Total Teachers"
          value={teacherStats.total}
          icon={FiUser}
          tone="info"
          hint={deptBreakdown(teacherStats.byDept) || undefined}
        />
        <StatCard
          label="Announcements"
          value={announcements.length}
          icon={FiBell}
          tone="warning"
        />
        <StatCard
          label="Exam Entries"
          value={examTimetable.length}
          icon={FiCreditCard}
          tone="success"
        />
      </div>

      <Card>
        <CardHeader
          title="Quick Control"
          description="Jump straight into the tools you use most."
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              {
                label: "Manage Students",
                route: "/admin/usermanagement",
                icon: FiUsers,
              },
              {
                label: "Manage Teachers",
                route: "/admin/teachermanagement",
                icon: FiUser,
              },
              {
                label: "Announcements",
                route: "/admin/announcements",
                icon: FiBell,
              },
              {
                label: "Subject Sets",
                route: "/admin/subject-sets",
                icon: FiLayers,
              },
              {
                label: "Bulk Update",
                route: "/admin/bulk-academic-update",
                icon: FiEdit3,
              },
              {
                label: "Settings",
                route: "/admin/settings",
                icon: FiSettings,
              },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => router.push(action.route)}
                  className="flex items-center justify-between rounded-card border border-line bg-canvas px-4 py-3.5 text-left text-ink transition hover:border-brand-200 hover:bg-brand-50"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4 text-brand-600" /> {action.label}
                  </span>
                  <FiChevronRight className="h-4 w-4 text-ink-faint" />
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  );

  const renderSectionPanel = ({
    title,
    description,
    primaryLabel,
    primaryRoute,
    secondaryLabel,
    secondaryRoute,
  }) => (
    <div className="space-y-6">
      <Card className="animate-fade-up">
        <CardBody className="px-6 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ink-faint">
            Admin Workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{description}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Quick Actions" />
        <CardBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button onClick={() => router.push(primaryRoute)} fullWidth>
              {primaryLabel}
              <FiChevronRight className="h-4 w-4" />
            </Button>
            {secondaryLabel && secondaryRoute ? (
              <Button
                variant="secondary"
                onClick={() => router.push(secondaryRoute)}
                fullWidth
              >
                {secondaryLabel}
                <FiChevronRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );

  const renderCalendarsPanel = () => (
    <div className="space-y-6">
      <Card className="animate-fade-up">
        <CardBody className="px-6 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ink-faint">
            Admin Workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Calendars
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Access events and academic calendars from one place.
          </p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <button
          type="button"
          onClick={() => router.push("/events-calendar")}
          className="rounded-card border border-line bg-surface p-5 text-left shadow-card transition hover:border-brand-200 hover:bg-brand-50"
        >
          <div className="mb-1.5 flex items-center gap-2 text-ink">
            <FiCalendar className="h-5 w-5 text-brand-600" />
            <span className="text-base font-semibold">Events Calendar</span>
          </div>
          <p className="text-sm text-ink-soft">View and manage campus events.</p>
        </button>

        <button
          type="button"
          onClick={() => router.push("/academic-calendar")}
          className="rounded-card border border-line bg-surface p-5 text-left shadow-card transition hover:border-brand-200 hover:bg-brand-50"
        >
          <div className="mb-1.5 flex items-center gap-2 text-ink">
            <FiCreditCard className="h-5 w-5 text-brand-600" />
            <span className="text-base font-semibold">Academic Calendar</span>
          </div>
          <p className="text-sm text-ink-soft">
            Review semester schedule and exam windows.
          </p>
        </button>
      </div>

      <Card>
        <CardBody>
          <CalendarComponent />
        </CardBody>
      </Card>
    </div>
  );

  const renderStudentsPanel = () => (
    <div className="space-y-6">
      <Card className="animate-fade-up">
        <CardBody className="px-6 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ink-faint">
            Admin Workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Students
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Recent students rendered directly in dashboard center.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Student Records"
          actions={
            <Button
              size="sm"
              onClick={() => router.push("/admin/usermanagement")}
            >
              Open Full Management
            </Button>
          }
        />
        <CardBody>
          {studentOnlyUsers.length === 0 ? (
            <EmptyState
              icon={FiUsers}
              title="No student records found."
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Email</TH>
                    <TH>Roll</TH>
                    <TH>Department</TH>
                  </TR>
                </THead>
                <TBody>
                  {studentOnlyUsers.slice(0, 12).map((student) => (
                    <TR key={student.id}>
                      <TD className="font-medium">
                        {student.name || student.displayName || "-"}
                      </TD>
                      <TD className="text-ink-soft">{student.email || "-"}</TD>
                      <TD className="text-ink-soft">
                        {student.rollNo || student.rollNumber || "-"}
                      </TD>
                      <TD className="text-ink-soft">
                        {student.dept || student.department || "-"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>
    </div>
  );

  const renderTeachersPanel = () => (
    <div className="space-y-6">
      <Card className="animate-fade-up">
        <CardBody className="px-6 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ink-faint">
            Admin Workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Teachers
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Faculty overview rendered in dashboard center.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Teacher Records"
          actions={
            <Button
              size="sm"
              onClick={() => router.push("/admin/teachermanagement")}
            >
              Open Full Management
            </Button>
          }
        />
        <CardBody>
          {teachers.length === 0 ? (
            <EmptyState
              icon={FiUser}
              title="No teacher records found."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {teachers.slice(0, 12).map((teacher) => (
                <div
                  key={teacher.id}
                  className="rounded-card border border-line bg-canvas p-4"
                >
                  <p className="text-sm font-semibold text-ink">
                    {teacher.name || teacher.displayName || "Unnamed Teacher"}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {teacher.email || "-"}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {teacher.department || teacher.dept || "Department not set"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );

  const renderAnnouncementsPanel = () => (
    <div className="space-y-6">
      <Card className="animate-fade-up">
        <CardBody className="px-6 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ink-faint">
            Admin Workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Announcements
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Latest notices rendered here in dashboard center.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Recent Announcements"
          actions={
            <Button
              size="sm"
              onClick={() => router.push("/admin/announcements")}
            >
              Open Full Management
            </Button>
          }
        />
        <CardBody>
          {announcements.length === 0 ? (
            <EmptyState
              icon={FiBell}
              title="No announcements available."
            />
          ) : (
            <div className="space-y-3">
              {announcements.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="rounded-card border border-line bg-canvas p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {item.title || "Untitled"}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-ink-soft">
                        {item.message || "-"}
                      </p>
                    </div>
                    <Badge tone={item.active ? "success" : "neutral"}>
                      {item.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );

  const renderExamPanel = () => (
    <div className="space-y-6">
      <Card className="animate-fade-up">
        <CardBody className="px-6 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ink-faint">
            Admin Workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Exam Timetable
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Upcoming exam entries rendered in center panel.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Upcoming Exams"
          actions={
            <Button
              size="sm"
              onClick={() => router.push("/admin/exam-timetable")}
            >
              Open Full Management
            </Button>
          }
        />
        <CardBody>
          {examTimetable.length === 0 ? (
            <EmptyState
              icon={FiCreditCard}
              title="No exam timetable data available."
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Course</TH>
                    <TH>Year</TH>
                    <TH>Branch</TH>
                  </TR>
                </THead>
                <TBody>
                  {examTimetable.slice(0, 12).map((exam) => (
                    <TR key={exam.id}>
                      <TD>{exam.date || "-"}</TD>
                      <TD>{exam.courseName || exam.subject || "-"}</TD>
                      <TD className="text-ink-soft">{exam.year || "-"}</TD>
                      <TD className="text-ink-soft">{exam.branch || "-"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>
    </div>
  );

  const renderActivePanel = () => {
    if (activeTab === "overview") return renderOverview();
    if (activeTab === "students") return renderStudentsPanel();
    if (activeTab === "teachers") return renderTeachersPanel();
    if (activeTab === "announcements") return renderAnnouncementsPanel();
    if (activeTab === "fixit")
      return <FixItBoard role="admin" displayName={adminName} />;
    if (activeTab === "calendars") return renderCalendarsPanel();
    if (activeTab === "exam-timetable") return renderExamPanel();

    const panelMap = {
      students: {
        title: "Students",
        description: "Manage student records, edits, and enrollment updates.",
        primaryLabel: "Open Student Management",
        primaryRoute: "/admin/usermanagement",
        secondaryLabel: "Open Bulk Academic Update",
        secondaryRoute: "/admin/bulk-academic-update",
      },
      teachers: {
        title: "Teachers",
        description: "Manage faculty profiles and assignment mappings.",
        primaryLabel: "Open Teacher Management",
        primaryRoute: "/admin/teachermanagement",
      },
      "subject-sets": {
        title: "Subject Sets",
        description: "Maintain branch-year-semester subject matrices.",
        primaryLabel: "Open Subject Set Management",
        primaryRoute: "/admin/subject-sets",
      },
      upload: {
        title: "Bulk Onboarding",
        description:
          "Parse admission data and create student accounts in bulk.",
        primaryLabel: "Open Bulk Student Onboarding",
        primaryRoute: "/admin/upload-students",
      },
      "bulk-update": {
        title: "Bulk Academic Update",
        description: "Apply branch/year/semester updates to many students.",
        primaryLabel: "Open Bulk Academic Update",
        primaryRoute: "/admin/bulk-academic-update",
      },
      announcements: {
        title: "Announcements",
        description: "Create and manage notices for all users.",
        primaryLabel: "Open Announcement Management",
        primaryRoute: "/admin/announcements",
      },
      "exam-timetable": {
        title: "Exam Timetable",
        description: "Upload and manage exam timetables for all branches.",
        primaryLabel: "Open Exam Timetable Management",
        primaryRoute: "/admin/exam-timetable",
      },
      settings: {
        title: "Settings",
        description: "Configure admin-level platform preferences.",
        primaryLabel: "Open Admin Settings",
        primaryRoute: "/admin/settings",
      },
    };

    const panel = panelMap[activeTab];
    if (!panel) return renderOverview();
    return renderSectionPanel(panel);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Dashboard"
        description="Campus control center"
        actions={
          <Button variant="ghost" onClick={handleLogout}>
            <FiLogOut className="h-4 w-4" /> Logout
          </Button>
        }
      />

      {error ? (
        <div className="rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <Tabs
        items={navItems.map((item) => {
          const Icon = item.icon;
          return {
            value: item.id,
            label: (
              <span className="flex items-center gap-1.5">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
            ),
          };
        })}
        value={activeTab}
        onChange={(value) => {
          const item = navItems.find((i) => i.id === value);
          if (item) openNavItem(item);
        }}
      />

      <div>{renderActivePanel()}</div>
    </div>
  );
}
