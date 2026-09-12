"use client";

// Minimal branded chrome for authentication pages — no app navbar.
import Link from "next/link";
import { GraduationCap } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-16 items-center justify-between px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="text-sm font-bold tracking-tight text-ink">
            CampusConnect
          </span>
        </Link>
        <Link
          href="/"
          className="text-sm font-medium text-ink-soft transition hover:text-ink"
        >
          Back to home
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 pb-10">
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}
