"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { loginWithEmailPassword, auth } from "@/lib/client/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import AuthCard from "@/components/auth/AuthCard";
import Button from "@/components/ui/Button";
import { Field, Input, PasswordInput } from "@/components/ui/Field";
import { PageLoader } from "@/components/ui/States";

export default function AdminAuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [user, loading] = useAuthState(auth);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      if (user) {
        const tokenResult = await user.getIdTokenResult(true);
        if (tokenResult.claims.admin) {
          router.push("/admin-dashboard");
        }
      }
      setCheckingAdmin(false);
    };

    checkAdmin();
  }, [user, router]);

  if (loading || checkingAdmin) {
    return <PageLoader label="Checking admin status..." />;
  }

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await loginWithEmailPassword(email, password);
      const user = auth.currentUser;

      if (user) {
        const tokenResult = await user.getIdTokenResult(true);
        if (tokenResult.claims.admin) {
          router.push("/admin-dashboard");
        } else {
          setError("You are not authorized as admin.");
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      accent="admin"
      icon={ShieldCheck}
      kicker="Admin portal"
      title="Campus control center"
      panelTitle="Run your institution from one place"
      panelText="Sign in to manage students, teachers, subjects, announcements, and campus-wide academic operations."
      highlights={[
        "Student and teacher management",
        "Bulk onboarding and academic updates",
        "Exam timetables and announcements",
      ]}
      error={error}
    >
      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        <Field label="Admin email" htmlFor="admin-email" required>
          <Input
            id="admin-email"
            type="email"
            autoComplete="email"
            placeholder="Enter admin email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="admin-password" required>
          <PasswordInput
            id="admin-password"
            autoComplete="current-password"
            placeholder="Enter password"
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
            className="font-medium text-amber-600 hover:text-amber-700 hover:underline"
          >
            Forgot password?
          </button>
        </div>

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={submitting}
          className="!bg-amber-600 hover:!bg-amber-700"
        >
          {submitting ? "Signing in..." : "Sign in as Admin"}
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
