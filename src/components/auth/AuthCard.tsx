"use client";

// Shared two-panel authentication layout with a role accent.
import type { ComponentType, ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

export type AuthAccent = "student" | "teacher" | "admin";

const accents: Record<
  AuthAccent,
  { panel: string; chip: string; kicker: string }
> = {
  student: {
    panel: "from-brand-700 via-brand-600 to-indigo-500",
    chip: "bg-brand-50 text-brand-700",
    kicker: "text-brand-600",
  },
  teacher: {
    panel: "from-emerald-700 via-emerald-600 to-teal-500",
    chip: "bg-emerald-50 text-emerald-700",
    kicker: "text-emerald-600",
  },
  admin: {
    panel: "from-amber-600 via-orange-500 to-orange-400",
    chip: "bg-amber-50 text-amber-700",
    kicker: "text-amber-600",
  },
};

export default function AuthCard({
  accent,
  icon: Icon,
  kicker,
  title,
  panelTitle,
  panelText,
  highlights,
  notice,
  error,
  children,
}: {
  accent: AuthAccent;
  icon: ComponentType<{ className?: string }>;
  kicker: string;
  title: string;
  panelTitle: string;
  panelText: string;
  highlights: string[];
  notice?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  const a = accents[accent];

  return (
    <div className="mx-auto grid w-full max-w-4xl animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface shadow-pop lg:grid-cols-[5fr_6fr]">
      {/* Accent panel */}
      <div className={`hidden bg-gradient-to-br ${a.panel} p-8 text-white lg:flex lg:flex-col`}>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
          <Icon className="h-6 w-6" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold leading-snug">{panelTitle}</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/85">{panelText}</p>
        <ul className="mt-8 space-y-3">
          {highlights.map((h) => (
            <li key={h} className="flex items-start gap-2.5 text-sm text-white/90">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
              {h}
            </li>
          ))}
        </ul>
        <p className="mt-auto pt-8 text-xs text-white/60">
          CampusConnect · Unified campus platform
        </p>
      </div>

      {/* Form panel */}
      <div className="p-6 sm:p-8">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${a.chip}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {kicker}
        </span>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{title}</h2>

        {notice ? (
          <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50/80 px-3.5 py-2.5 text-xs leading-relaxed text-sky-800 sm:text-sm">
            {notice}
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
          >
            {error}
          </div>
        ) : null}

        {children}
      </div>
    </div>
  );
}
