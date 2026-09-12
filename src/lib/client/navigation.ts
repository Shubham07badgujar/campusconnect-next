// Role-based navigation — the single source of truth for the app sidebar.
// Every href here is a REAL route that exists under src/app. Do not add
// aspirational items: the sidebar must never link to a page that doesn't exist.
import type { ComponentType } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  BookOpen,
  Bell,
  MessagesSquare,
  MessageCircle,
  Users,
  UserCog,
  Layers,
  Upload,
  RefreshCcw,
  Megaphone,
  FileSpreadsheet,
  Settings,
  User,
  Table2,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** also mark active for these prefixes (e.g. /chat/[teacherId]) */
  activePrefixes?: string[];
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export type AppRole = "student" | "teacher" | "admin";

const accountGroup: NavGroup = {
  title: "Account",
  items: [
    { label: "Profile", href: "/profile", icon: User, activePrefixes: ["/edit-profile", "/change-password"] },
  ],
};

export const NAVIGATION: Record<AppRole, NavGroup[]> = {
  student: [
    {
      title: "Overview",
      items: [{ label: "Dashboard", href: "/student-dashboard", icon: LayoutDashboard }],
    },
    {
      title: "Academics",
      items: [
        { label: "Attendance", href: "/student-attendance", icon: ClipboardCheck },
        { label: "My Timetable", href: "/student-timetable", icon: Table2 },
        { label: "Exam Timetable", href: "/exam-timetable", icon: CalendarClock },
        { label: "Study Resources", href: "/study-materials", icon: BookOpen },
      ],
    },
    {
      title: "Campus",
      items: [
        { label: "Announcements", href: "/announcements", icon: Bell },
        { label: "Calendars", href: "/calendars", icon: CalendarDays, activePrefixes: ["/events-calendar", "/academic-calendar"] },
      ],
    },
    {
      title: "Communication",
      items: [
        { label: "Discussions", href: "/discussions", icon: MessagesSquare },
        { label: "Messages", href: "/chat", icon: MessageCircle, activePrefixes: ["/chat/"] },
      ],
    },
    accountGroup,
  ],
  teacher: [
    {
      title: "Overview",
      items: [{ label: "Dashboard", href: "/teacher-dashboard", icon: LayoutDashboard }],
    },
    {
      title: "Attendance",
      items: [
        { label: "Smart Attendance", href: "/teacher-attendance", icon: ClipboardCheck },
        { label: "Attendance Tracker", href: "/attendance-tracker", icon: ClipboardList },
      ],
    },
    {
      title: "Academics",
      items: [
        { label: "Timetable", href: "/teacher-timetable", icon: Table2 },
        { label: "My Students", href: "/teacher-students", icon: Users },
        { label: "Courses", href: "/teacher-courses", icon: GraduationCap },
        { label: "Study Material", href: "/teacher-studymaterial", icon: BookOpen },
        { label: "Exam Timetable", href: "/exam-timetable", icon: CalendarClock },
      ],
    },
    {
      title: "Campus",
      items: [
        { label: "Announcements", href: "/announcements", icon: Bell },
        { label: "Calendars", href: "/calendars", icon: CalendarDays, activePrefixes: ["/events-calendar", "/academic-calendar"] },
      ],
    },
    {
      title: "Communication",
      items: [
        { label: "Messages", href: "/chat", icon: MessageCircle, activePrefixes: ["/chat/"] },
      ],
    },
    accountGroup,
  ],
  admin: [
    {
      title: "Overview",
      items: [{ label: "Dashboard", href: "/admin-dashboard", icon: LayoutDashboard, activePrefixes: ["/admin/dashboard"] }],
    },
    {
      title: "People",
      items: [
        { label: "Students", href: "/admin/usermanagement", icon: Users },
        { label: "Teachers", href: "/admin/teachermanagement", icon: UserCog, activePrefixes: ["/admin-addteacher"] },
      ],
    },
    {
      title: "Academics",
      items: [
        { label: "Subject Sets", href: "/admin/subject-sets", icon: Layers },
        { label: "Exam Timetable", href: "/admin/exam-timetable", icon: FileSpreadsheet },
      ],
    },
    {
      title: "Bulk Operations",
      items: [
        { label: "Student Onboarding", href: "/admin/upload-students", icon: Upload },
        { label: "Academic Update", href: "/admin/bulk-academic-update", icon: RefreshCcw },
      ],
    },
    {
      title: "Campus",
      items: [
        { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
        { label: "Calendars", href: "/calendars", icon: CalendarRange, activePrefixes: ["/events-calendar", "/academic-calendar"] },
      ],
    },
    {
      title: "System",
      items: [{ label: "Settings", href: "/admin/settings", icon: Settings }],
    },
    accountGroup,
  ],
};

/** Human titles for breadcrumbs / header, keyed by pathname. */
export const ROUTE_TITLES: Record<string, string> = {
  "/student-dashboard": "Dashboard",
  "/student-attendance": "Attendance",
  "/student-timetable": "My Timetable",
  "/teacher-dashboard": "Dashboard",
  "/teacher-attendance": "Smart Attendance",
  "/attendance-tracker": "Attendance Tracker",
  "/teacher-timetable": "Timetable",
  "/teacher-students": "My Students",
  "/teacher-courses": "Courses",
  "/teacher-studymaterial": "Study Material",
  "/admin-dashboard": "Dashboard",
  "/admin/dashboard": "Dashboard",
  "/admin/usermanagement": "Students",
  "/admin/teachermanagement": "Teachers",
  "/admin-addteacher": "Teachers",
  "/admin/subject-sets": "Subject Sets",
  "/admin/exam-timetable": "Exam Timetable",
  "/admin/upload-students": "Student Onboarding",
  "/admin/bulk-academic-update": "Academic Update",
  "/admin/announcements": "Announcements",
  "/admin/settings": "Settings",
  "/announcements": "Announcements",
  "/study-materials": "Study Resources",
  "/calendars": "Calendars",
  "/events-calendar": "Events Calendar",
  "/academic-calendar": "Academic Calendar",
  "/exam-timetable": "Exam Timetable",
  "/discussions": "Discussions",
  "/chat": "Messages",
  "/profile": "Profile",
  "/edit-profile": "Edit Profile",
  "/change-password": "Change Password",
};

export const titleForPath = (pathname: string): string => {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  if (pathname.startsWith("/chat/")) return "Messages";
  const seg = pathname.split("/").filter(Boolean).pop() || "";
  return seg
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
};
