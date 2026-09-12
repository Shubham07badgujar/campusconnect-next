"use client";

import AnnouncementsBanner from "@/components/common/AnnouncementsBanner";
import Footer from "@/components/common/Footer";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/client/firebase";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarClock,
  CalendarRange,
  ChartColumnBig,
  CheckCircle2,
  Fingerprint,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  QrCode,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Users,
  UserCog,
} from "lucide-react";

function Home() {
  const [user] = useAuthState(auth);

  const fadeInUp: any = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const featureTiles = [
    {
      icon: LayoutDashboard,
      title: "Role-Based Dashboards",
      description:
        "Student, teacher, and admin workflows in one consistent interface.",
    },
    {
      icon: Bell,
      title: "Announcements & Alerts",
      description:
        "Real-time communication that keeps everyone synced and informed.",
    },
    {
      icon: CalendarRange,
      title: "Academic Calendar",
      description:
        "Institution events, holidays, and timelines in a clean visual view.",
    },
    {
      icon: CalendarClock,
      title: "Exam Timetable Engine",
      description:
        "Year-wise scheduling with branch-aware mapping and preview validation.",
    },
    {
      icon: ScanFace,
      title: "Face Attendance",
      description:
        "Liveness-checked identity verification for secure attendance capture.",
    },
    {
      icon: QrCode,
      title: "QR Attendance",
      description:
        "Scan-based class marking for low-friction attendance operations.",
    },
    {
      icon: Fingerprint,
      title: "Passkey Verification",
      description:
        "Server-verified WebAuthn passkeys add a strong anti-proxy layer.",
    },
    {
      icon: BookOpen,
      title: "Study Resources",
      description:
        "Subjects, notes, and materials with fast in-app discoverability.",
    },
    {
      icon: MessageSquare,
      title: "Campus Chat",
      description:
        "Direct realtime communication between students and faculty.",
    },
    {
      icon: ChartColumnBig,
      title: "Attendance Analytics",
      description:
        "Attendance trends and data-backed decision support for faculty.",
    },
    {
      icon: ShieldCheck,
      title: "Protected Access",
      description: "Route guards and role validation across the platform.",
    },
    {
      icon: Users,
      title: "Unified Campus Layer",
      description:
        "Keeps departments, batches, and stakeholders aligned in one place.",
    },
  ];

  const roles = [
    {
      icon: GraduationCap,
      title: "For Students",
      tone: "from-brand-600 to-indigo-500",
      points: [
        "Mark attendance by passkey, face, or teacher QR",
        "Follow timetables, exams, and subject-wise progress",
        "Get announcements and chat with faculty",
      ],
    },
    {
      icon: BookOpen,
      title: "For Teachers",
      tone: "from-emerald-600 to-teal-500",
      points: [
        "Run live attendance sessions with real-time tiles",
        "Manage timetables, students, and study material",
        "See attendance analytics and at-risk students",
      ],
    },
    {
      icon: UserCog,
      title: "For Administrators",
      tone: "from-amber-500 to-orange-500",
      points: [
        "Manage students, teachers, subjects, and departments",
        "Bulk onboarding and exam-timetable OCR pipelines",
        "Publish announcements and campus-wide operations",
      ],
    },
  ];

  const team = [
    {
      name: "Shubham Badgujar",
      role: "Project Creator · Architecture + Platform Logic",
    },
    { name: "Aditi Sharma", role: "Frontend + Product Experience" },
    { name: "Rohan Deshmukh", role: "Backend + Attendance Intelligence" },
    { name: "Sneha Kulkarni", role: "User Flow + Platform Reliability" },
  ];

  const primaryCta = user
    ? { href: "/student-dashboard", label: "Go to Dashboard" }
    : { href: "/auth/student", label: "Get Started" };

  return (
    <main className="overflow-x-hidden bg-canvas text-ink">
      {user && <AnnouncementsBanner />}

      {/* Hero — video background preserved */}
      <section className="relative h-screen w-full overflow-hidden bg-black">
        <video
          className="absolute inset-0 z-0 h-full w-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        >
          <source src="/video.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>

        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-slate-950/70 via-slate-900/45 to-slate-950/80" />

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="relative z-20 flex h-full flex-col items-center justify-center px-4 text-center text-white"
        >
          <motion.span
            variants={fadeInUp}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-medium backdrop-blur-md"
          >
            <Sparkles className="h-4 w-4" /> One connected platform for your entire campus
          </motion.span>

          <motion.h1
            variants={fadeInUp}
            className="mb-5 max-w-4xl bg-gradient-to-r from-blue-300 via-indigo-200 to-brand-300 bg-clip-text text-4xl font-extrabold leading-tight tracking-tight text-transparent sm:text-6xl md:text-7xl"
          >
            One platform for your entire campus
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="mb-8 max-w-2xl text-lg font-light text-slate-100 sm:text-xl"
          >
            Attendance, academics, communication, scheduling, resources, and
            administration — unified into one student-first campus operating system.
          </motion.p>

          <motion.div
            variants={fadeInUp}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              href={primaryCta.href}
              className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl sm:text-base"
            >
              {primaryCta.label}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#platform"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20 sm:text-base"
            >
              Explore Platform
            </a>
          </motion.div>

          <motion.div
            variants={fadeInUp}
            className="mt-8 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3"
          >
            {[
              { label: "Role Flows", value: "Student · Teacher · Admin" },
              { label: "Attendance", value: "Passkey · Face · QR" },
              { label: "Communication", value: "Realtime Alerts + Chat" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-left backdrop-blur-md"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                  {item.label}
                </p>
                <p className="mt-1 text-sm font-medium text-white">{item.value}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* Platform overview — feature grid */}
      <section id="platform" className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
              <Sparkles className="h-3.5 w-3.5" /> Platform Overview
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Everything your campus runs on, in one place
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-ink-soft">
              Each capability is a real, working part of CampusConnect — presented
              as one coherent, integrated experience.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featureTiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <div
                  key={tile.title}
                  className="group rounded-card border border-line bg-surface p-5 shadow-card transition hover:-translate-y-1 hover:shadow-pop"
                >
                  <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-base font-semibold text-ink">{tile.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                    {tile.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Role-based experience */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
              Built for every role
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              A workspace tailored to each person
            </h2>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {roles.map((role) => {
              const Icon = role.icon;
              return (
                <div
                  key={role.title}
                  className="rounded-card border border-line bg-surface p-6 shadow-card"
                >
                  <span
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${role.tone} text-white shadow-sm`}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-ink">
                    {role.title}
                  </h3>
                  <ul className="mt-3 space-y-2.5">
                    {role.points.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-sm text-ink-soft">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Attendance intelligence highlight */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
              <ShieldCheck className="h-4 w-4" /> Attendance Intelligence
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Attendance you can actually trust
            </h2>
            <p className="mt-3 text-base text-ink-soft">
              Three verification paths, all validated on the server — no method
              relies on the browser being honest. Passkeys are cryptographically
              verified, face marking requires a live blink and multi-frame match,
              and teacher QR provides a reliable fallback.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                { icon: Fingerprint, label: "WebAuthn passkeys (server-verified)" },
                { icon: ScanFace, label: "Face liveness + multi-frame match" },
                { icon: QrCode, label: "Teacher QR / manual fallback" },
                { icon: ChartColumnBig, label: "Trends and at-risk insights" },
              ].map((it) => {
                const Icon = it.icon;
                return (
                  <div
                    key={it.label}
                    className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium text-ink">{it.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-card bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-500 p-8 text-white shadow-pop sm:p-10">
            <h3 className="text-2xl font-bold sm:text-3xl">
              Bring your campus online in one flow
            </h3>
            <p className="mt-3 text-sm text-white/90">
              Move from fragmented processes to one coherent, student-first
              ecosystem.
            </p>
            <Link
              href={primaryCta.href}
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              {user ? "Open Dashboard" : "Start with CampusConnect"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
              The Team
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Built by the CampusConnect team
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((member) => (
              <div
                key={member.name}
                className="rounded-card border border-line bg-surface p-6 text-center shadow-card"
              >
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
                  {member.name
                    .split(" ")
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-ink">
                  {member.name}
                </h3>
                <p className="mt-1 text-xs text-ink-soft">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

export default Home;
