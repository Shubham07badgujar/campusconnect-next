"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FiCalendar, FiBook } from "react-icons/fi";
import { FaCalendarAlt, FaGraduationCap } from "react-icons/fa";
import { auth } from "@/lib/client/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";

function Calendars() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user] = useAuthState(auth);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  const isStudentUser = Boolean(user) && !isAdmin && !isTeacher;

  const handleBack = () => {
    if (isAdmin) {
      router.push("/admin-dashboard");
      return;
    }
    if (isTeacher) {
      router.push("/teacher-dashboard");
      return;
    }
    if (searchParams.get("fromStudentDashboard") || isStudentUser) {
      router.push("/student-dashboard");
      return;
    }
    router.back();
  };

  useEffect(() => {
    const checkUserRole = async () => {
      if (user) {
        try {
          const tokenResult = await user.getIdTokenResult(true);
          setIsAdmin(Boolean(tokenResult?.claims?.admin));
          setIsTeacher(Boolean(tokenResult?.claims?.teacher));
        } catch (error) {
          setIsAdmin(false);
          setIsTeacher(false);
        }
      }
    };
    checkUserRole();
  }, [user]);

  const calendarOptions = [
    {
      id: "events",
      title: "Events Calendar",
      description:
        "View upcoming college events, workshops, seminars, and activities",
      icon: FaCalendarAlt,
      path: "/events-calendar",
      gradient: "from-blue-500 to-indigo-600",
      bgGradient: "from-blue-50 to-indigo-50",
      borderColor: "border-blue-200",
      canEdit: isTeacher || isAdmin,
      editLabel:
        isTeacher || isAdmin ? "Teachers & Admins can edit" : "View only",
    },
    {
      id: "academic",
      title: "Academic Calendar",
      description:
        "Official academic schedule including semesters, exams, and holidays",
      icon: FaGraduationCap,
      path: "/academic-calendar",
      gradient: "from-purple-500 to-pink-600",
      bgGradient: "from-purple-50 to-pink-50",
      borderColor: "border-purple-200",
      canEdit: isAdmin,
      editLabel: isAdmin ? "Admins can edit" : "View only",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendars"
        description="Choose a calendar to view schedules and events."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {calendarOptions.map((option) => (
          <Link
            key={option.id}
            href={option.path}
            className="group rounded-card border border-line bg-surface p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop"
          >
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${option.gradient} text-white shadow-sm`}
            >
              <option.icon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-ink">
              {option.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              {option.description}
            </p>
            <div className="mt-4 flex items-center justify-between">
              <Badge tone={option.canEdit ? "success" : "neutral"}>
                {option.editLabel}
              </Badge>
              <span className="flex items-center gap-1 text-sm font-medium text-brand-600 transition group-hover:gap-2">
                View <FiCalendar className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <FiBook className="text-brand-600" /> About calendars
            </span>
          }
        />
        <CardBody className="space-y-2 text-sm text-ink-soft">
          <p>
            <strong className="text-ink">Events Calendar:</strong> College
            events, workshops, seminars, cultural activities, and important
            dates. Teachers and admins can add and manage events.
          </p>
          <p>
            <strong className="text-ink">Academic Calendar:</strong> Official
            academic schedule including semester dates, examination schedules,
            holidays, and submission deadlines. Only admins can modify this
            calendar.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

export default function CalendarsPage() {
  return (
    <Suspense fallback={null}>
      <Calendars />
    </Suspense>
  );
}
