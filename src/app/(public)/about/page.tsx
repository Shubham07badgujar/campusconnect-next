"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Blocks,
  Bot,
  Compass,
  GraduationCap,
  LayoutPanelTop,
  Rocket,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import Footer from "@/components/common/Footer";
import about_img from "@/assets/building.jpg";

const values = [
  {
    icon: Compass,
    title: "Student-Centered Decisions",
    description:
      "Every major flow starts with real student pain points and time-saving intent.",
  },
  {
    icon: Blocks,
    title: "Modular Platform Thinking",
    description:
      "Announcements, attendance, timetable, and analytics all work as one connected system.",
  },
  {
    icon: Shield,
    title: "Integrity + Trust",
    description:
      "Role-aware access and verification layers keep campus operations reliable.",
  },
  {
    icon: Rocket,
    title: "Rapid Iteration",
    description:
      "We ship, learn, and refine continuously from usage patterns and feedback loops.",
  },
];

const featureStories = [
  {
    tag: "Communication",
    title: "Announcements that actually reach everyone",
    detail:
      "From critical alerts to academic reminders, notifications are built for high visibility and low friction.",
  },
  {
    tag: "Academic Operations",
    title: "Calendar and exam flow, centrally managed",
    detail:
      "Year-wise scheduling and structured previews reduce admin overhead and confusion.",
  },
  {
    tag: "Attendance Intelligence",
    title: "Face, QR, and passkey-ready workflows",
    detail:
      "Flexible attendance paths designed for both classroom speed and record confidence.",
  },
  {
    tag: "Insights",
    title: "Data-backed visibility for teachers and admins",
    detail:
      "Attendance analytics and trend surfaces help teams take action earlier.",
  },
];

const team = [
  {
    name: "Shubham Badgujar",
    role: "Project Creator · Architecture + Platform Logic",
    focus: "Release stability, testing strategy, and deployment quality.",
  },
  {
    name: "Aditi Sharma",
    role: "Frontend + Product Experience",
    focus: "Design systems, UX choreography, and student-facing flows.",
  },
  {
    name: "Rohan Deshmukh",
    role: "Backend + Attendance Intelligence",
    focus: "Face-recognition pipelines, automation, and real-time services.",
  },
  {
    name: "Sneha Kulkarni",
    role: "User Flow + Platform Reliability",
    focus: "Verification flows and high-confidence attendance records.",
  },
];

const fadeInUp: any = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

function About() {
  return (
    <div className="bg-canvas text-ink">
      {/* Hero — campus building image preserved */}
      <section className="relative isolate h-[68vh] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={about_img.src}
          alt="Campus building"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-900/45 to-canvas" />

        <div className="relative z-10 mx-auto flex h-full max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl text-white"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5" /> About CampusConnect
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
              Building the digital spine
              <span className="block bg-gradient-to-r from-blue-300 via-indigo-200 to-brand-300 bg-clip-text text-transparent">
                for student life
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-base text-white/90 sm:text-lg">
              Started by four developers, CampusConnect turns scattered campus
              workflows into one elegant, dependable platform.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Mission + Platform snapshot */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-card border border-line bg-surface p-7 shadow-card sm:p-9">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
              <GraduationCap className="h-4 w-4" /> Our Mission
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Simplify campus operations without losing human connection
            </h2>
            <p className="mt-4 text-ink-soft">
              We are designing a platform where communication, attendance,
              scheduling, and academic planning feel coherent instead of
              fragmented. CampusConnect is focused on reducing admin fatigue and
              improving student clarity every day.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {[
                "Unified admin-teacher-student experience",
                "Reliable reminders and communication loops",
                "Attendance integrity with modern verification",
                "Scalable architecture for campus growth",
              ].map((line) => (
                <div
                  key={line}
                  className="rounded-lg border border-line bg-canvas px-4 py-3 text-sm font-medium text-ink"
                >
                  {line}
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-card bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-500 p-7 text-white shadow-pop sm:p-9">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/90">
              <LayoutPanelTop className="h-4 w-4" /> Platform Snapshot
            </span>
            <div className="mt-5 space-y-3 text-sm text-white/95">
              <p>12+ major modules integrated under one product surface.</p>
              <p>Role-specific flows for admin, teacher, and student contexts.</p>
              <p>Real-time notifications and exam reminder support.</p>
              <p>Attendance stack with server-verified passkeys and face liveness.</p>
            </div>
          </aside>
        </div>
      </section>

      {/* Values */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
              What Guides Us
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Principles behind the product
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((value) => {
              const Icon = value.icon;
              return (
                <div
                  key={value.title}
                  className="rounded-card border border-line bg-surface p-6 shadow-card"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-ink">
                    {value.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                    {value.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* What we are building */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
              <Bot className="h-3.5 w-3.5" /> What We Are Building
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Design, intelligence, and workflow depth
            </h2>
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid gap-4 md:grid-cols-2"
          >
            {featureStories.map((story) => (
              <motion.article
                key={story.title}
                variants={fadeInUp}
                className="rounded-card border border-line bg-surface p-6 shadow-card transition hover:-translate-y-1 hover:shadow-pop"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">
                  {story.tag}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-ink">
                  {story.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {story.detail}
                </p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Team */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
              <Users className="h-3.5 w-3.5" /> Team Behind CampusConnect
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Four minds, one campus-grade mission
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-ink-soft">
              A compact developer squad blending product design, attendance
              intelligence, backend architecture, and release discipline.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {team.map((member, index) => (
              <div
                key={member.name}
                className="rounded-card border border-line bg-surface p-6 shadow-card transition hover:-translate-y-1 hover:shadow-pop"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-sm font-bold text-brand-700">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink">
                  {member.name}
                </h3>
                <p className="mt-1 text-sm font-medium text-ink-soft">
                  {member.role}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  {member.focus}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center rounded-card bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-500 px-6 py-12 text-center text-white shadow-pop sm:px-10">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Want to explore CampusConnect in action?
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-white/90">
            See how your campus can move from isolated tools to one coherent,
            student-focused operating layer.
          </p>
          <Link
            href="/login"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
          >
            Start Exploring <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default About;
