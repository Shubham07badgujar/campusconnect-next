"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck } from "lucide-react";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import AuthCard from "@/components/auth/AuthCard";
import Button from "@/components/ui/Button";
import { Field, Input, PasswordInput } from "@/components/ui/Field";

export default function TeacherAuthPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const auth = getAuth();
  const apiBase = "";

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const normalizedIdentifier = identifier.trim();
      if (!normalizedIdentifier) {
        throw new Error("Please enter Login ID or Email.");
      }

      let loginEmail = normalizedIdentifier;
      if (!normalizedIdentifier.includes("@")) {
        const resolveResponse = await fetch(
          `${apiBase}/api/teachers/resolve-login/${encodeURIComponent(normalizedIdentifier)}`,
        );
        const resolveData = await resolveResponse.json();
        if (!resolveResponse.ok) {
          throw new Error(resolveData.message || "Invalid teacher login ID.");
        }
        loginEmail = resolveData.email;
      }

      const userCredential = await signInWithEmailAndPassword(
        auth,
        loginEmail,
        password,
      );
      const user = userCredential.user;

      if (user) {
        const tokenResult = await user.getIdTokenResult(true);

        if (tokenResult.claims.teacher) {
          router.push("/teacher-dashboard");
        } else {
          setError("You are not authorized as a teacher.");
        }
      }
    } catch (err: any) {
      console.error("Login Error:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      accent="teacher"
      icon={BookOpenCheck}
      kicker="Faculty portal"
      title="Welcome back"
      panelTitle="Manage attendance and classroom control"
      panelText="Sign in with your Teacher ID or registered email to start sessions, view analytics, and manage student attendance."
      highlights={[
        "Teacher ID to email resolution is supported",
        "Live attendance sessions with QR fallback",
        "Subject analytics and exportable records",
      ]}
      error={error}
    >
      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        <Field
          label="Teacher Login ID or Email"
          htmlFor="teacher-id"
          required
          hint="Example: pm01 or teacher@college.edu"
        >
          <Input
            id="teacher-id"
            type="text"
            autoComplete="username"
            placeholder="Login ID or email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="teacher-password" required>
          <PasswordInput
            id="teacher-password"
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
                `/reset-password?loginId=${encodeURIComponent(String(identifier || "").trim())}`,
              )
            }
            className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
          >
            Forgot password?
          </button>
        </div>

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={loading}
          className="!bg-emerald-600 hover:!bg-emerald-700"
        >
          {loading ? "Signing in..." : "Sign in as Teacher"}
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
