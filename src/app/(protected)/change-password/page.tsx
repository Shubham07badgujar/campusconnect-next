"use client";

import { useState } from "react";
import { auth } from "@/lib/client/firebase";
import { useRouter } from "next/navigation";
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { FiLock, FiCheck, FiAlertCircle, FiShield } from "react-icons/fi";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Field, PasswordInput } from "@/components/ui/Field";
import Button from "@/components/ui/Button";

function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleChangePassword = async (e: any) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
      setError("User not authenticated.");
      return;
    }

    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword,
      );
      await reauthenticateWithCredential(user, credential);

      await updatePassword(user, newPassword);

      setSuccess("Password updated successfully! Redirecting to login...");

      // ✅ Optional: Logout after password update
      setTimeout(async () => {
        await auth.signOut();
        router.push("/login");
      }, 2000);
    } catch (err: any) {
      setLoading(false);
      if (err.code === "auth/wrong-password") {
        setError("Current password is incorrect.");
      } else if (err.code === "auth/weak-password") {
        setError("New password is too weak.");
      } else {
        setError(err.message);
      }
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl animate-fade-up space-y-6">
      <PageHeader
        title="Change Password"
        description="Keep your account secure with a strong, unique password."
      />

      <Card>
        <CardBody className="space-y-5">
          <form onSubmit={handleChangePassword} className="space-y-5">
            <Field label="Current Password" htmlFor="currentPassword" required>
              <PasswordInput
                id="currentPassword"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>

            <Field label="New Password" htmlFor="newPassword" required>
              <PasswordInput
                id="newPassword"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Field>

            <Field
              label="Confirm New Password"
              htmlFor="confirmPassword"
              required
            >
              <PasswordInput
                id="confirmPassword"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </Field>

            {error ? (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-danger">
                <FiAlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            ) : null}
            {success ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-success">
                <FiCheck className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">{success}</span>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => router.push("/profile")}
              >
                Cancel
              </Button>
              <Button type="submit" loading={loading} fullWidth>
                <FiLock className="h-4 w-4" />
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </div>
          </form>

          <div className="rounded-lg border border-line bg-brand-50/60 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-700">
              <FiShield className="h-4 w-4" />
              Security tips
            </p>
            <ul className="ml-4 list-disc space-y-1 text-xs text-ink-soft">
              <li>Use at least 6 characters</li>
              <li>Include numbers and special characters</li>
              <li>Don&apos;t reuse old passwords</li>
            </ul>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default ChangePassword;
