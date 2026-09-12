"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { loginWithEmailPassword } from "@/lib/client/firebase";
import AuthCard from "@/components/auth/AuthCard";
import Button from "@/components/ui/Button";
import { Field, Input, PasswordInput } from "@/components/ui/Field";

export default function StudentAuthPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const safeEmail = String(email || "").trim();
    const safePassword = String(password || "").trim();

    if (!safeEmail || !safePassword) {
      setError("Email and password are required.");
      setLoading(false);
      return;
    }

    try {
      await loginWithEmailPassword(safeEmail, safePassword);
      router.push("/student-dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      accent="student"
      icon={GraduationCap}
      kicker="Student portal"
      title="Welcome back"
      panelTitle="Your student workspace"
      panelText="Sign in to mark attendance, follow your subjects, and track academic progress from one dashboard."
      highlights={[
        "Attendance sessions with biometric verification",
        "Subject-wise analytics and records",
        "Timetables, exams, and study resources",
      ]}
      notice="Student accounts are created by the admin. Contact your admin if you do not have login credentials."
      error={error}
    >
      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        <Field label="Email" htmlFor="student-email" required>
          <Input
            id="student-email"
            type="email"
            autoComplete="email"
            placeholder="you@campusconnect.student"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="student-password" required>
          <PasswordInput
            id="student-password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <div className="flex items-center justify-end text-sm">
          <button
            type="button"
            onClick={() =>
              router.push(
                `/reset-password?loginId=${encodeURIComponent(String(email || "").trim())}`,
              )
            }
            className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            Forgot password?
          </button>
        </div>

        <Button type="submit" fullWidth size="lg" loading={loading}>
          {loading ? "Signing in..." : "Sign in as Student"}
        </Button>
      </form>

      <div className="mt-5 text-sm">
        <button
          onClick={() => router.push("/login")}
          type="button"
          className="font-medium text-ink-soft transition hover:text-ink"
        >
          ← Choose a different role
        </button>
      </div>
    </AuthCard>
  );
}
