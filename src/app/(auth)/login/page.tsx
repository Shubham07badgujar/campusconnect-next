"use client";

import Link from "next/link";
import {
  GraduationCap,
  BookOpenCheck,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

const roles = [
  {
    href: "/auth/student",
    icon: GraduationCap,
    title: "Student",
    description:
      "Mark attendance, follow your timetable, and track subjects and exams.",
    accent: "bg-brand-50 text-brand-700 group-hover:bg-brand-600 group-hover:text-white",
    ring: "hover:border-brand-300",
  },
  {
    href: "/auth/teacher",
    icon: BookOpenCheck,
    title: "Teacher",
    description:
      "Run live attendance sessions, manage timetables, and view class analytics.",
    accent:
      "bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white",
    ring: "hover:border-emerald-300",
  },
  {
    href: "/auth/admin",
    icon: ShieldCheck,
    title: "Administrator",
    description:
      "Manage students, teachers, subjects, announcements, and campus operations.",
    accent:
      "bg-amber-50 text-amber-700 group-hover:bg-amber-500 group-hover:text-white",
    ring: "hover:border-amber-300",
  },
];

export default function LoginRoleSelectPage() {
  return (
    <div className="mx-auto w-full max-w-2xl animate-fade-up text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        Welcome to CampusConnect
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        Choose how you want to sign in. Each role has its own workspace.
      </p>

      <div className="mt-8 space-y-3 text-left">
        {roles.map((role) => {
          const Icon = role.icon;
          return (
            <Link
              key={role.href}
              href={role.href}
              className={`group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop ${role.ring}`}
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${role.accent}`}
              >
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-ink">
                  Continue as {role.title}
                </span>
                <span className="mt-0.5 block text-sm text-ink-soft">
                  {role.description}
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-ink" />
            </Link>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-ink-faint">
        Accounts are created by your campus administrator. Trouble signing in?
        Use &ldquo;Forgot password&rdquo; on your role&rsquo;s sign-in page.
      </p>
    </div>
  );
}
