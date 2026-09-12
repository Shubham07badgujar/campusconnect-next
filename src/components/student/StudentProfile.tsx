"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { auth } from "@/lib/client/firebase";
import {
  FiMail,
  FiBook,
  FiCalendar,
  FiLogOut,
  FiEdit,
  FiLock,
  FiClock,
} from "react-icons/fi";
import { useCallback, useEffect, useMemo, useState } from "react";
import FingerprintVerification from "@/components/student/FingerprintVerification";
import { getFaceProfileStatus } from "@/lib/client/attendanceService";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import StatCard from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/States";

const StudentQRDisplay = dynamic(
  () => import("@/components/student/StudentQRDisplay"),
  { ssr: false },
);
const FaceRegistration = dynamic(
  () => import("@/components/student/FaceRegistration"),
  { ssr: false },
);

const StudentProfile = ({ userData }: any) => {
  const router = useRouter();
  const [registeredPasskey, setRegisteredPasskey] = useState<any>(null);
  const [faceRegistered, setFaceRegistered] = useState(false);
  const [faceStatusLoading, setFaceStatusLoading] = useState(true);

  const refreshFaceStatus = useCallback(async () => {
    try {
      setFaceStatusLoading(true);
      const result = await getFaceProfileStatus();
      setFaceRegistered(Boolean(result?.registered));
    } catch {
      setFaceRegistered(false);
    } finally {
      setFaceStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshFaceStatus();
  }, [refreshFaceStatus]);

  const passkeyCreatedLabel = useMemo(() => {
    const createdAt = Number(registeredPasskey?.createdAt || 0);
    if (!createdAt) {
      return "";
    }

    const parsed = new Date(createdAt);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return parsed.toLocaleString();
  }, [registeredPasskey]);

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/login");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        description="Your academic details, attendance identity, and account settings."
        actions={
          <Button onClick={() => router.push("/edit-profile")}>
            <FiEdit className="h-4 w-4" /> Edit Profile
          </Button>
        }
      />

      <Card>
        <CardBody className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <Avatar
            name={userData?.displayName || "Student"}
            src={userData?.photoURL}
            size="xl"
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-xl font-semibold text-ink">
              {userData?.displayName || "Student"}
            </h2>
            <div className="mt-1 flex items-center justify-center gap-2 text-sm text-ink-soft sm:justify-start">
              <FiMail className="h-4 w-4" />
              <span className="break-all">{userData?.email}</span>
            </div>
            <div className="mt-2 flex justify-center sm:justify-start">
              <Badge tone="brand">Student Account</Badge>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Academic Details" />
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-canvas p-3">
              <span className="text-sm text-ink-soft">Roll Number</span>
              <span className="text-sm font-semibold text-ink">
                {userData?.rollNumber || "Not assigned"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-canvas p-3">
              <span className="text-sm text-ink-soft">Department</span>
              <span className="text-sm font-semibold text-ink">
                {userData?.dept || "Not assigned"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatCard label="Year" value={userData?.year || "-"} tone="brand" />
              <StatCard
                label="Semester"
                value={userData?.semester || "-"}
                tone="success"
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Enrolled Subjects" />
          <CardBody>
            {userData?.subjects && userData.subjects.length > 0 ? (
              <div className="cc-scroll max-h-64 space-y-3 overflow-y-auto">
                {userData.subjects.map((subject: any, index: any) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 rounded-lg border border-line bg-canvas p-3"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-ink">
                      {subject}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FiBook}
                title="No subjects yet"
                description="Subjects you are enrolled in will appear here."
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Attendance Backup QR" />
          <CardBody>
            <StudentQRDisplay
              studentInfo={{
                ...userData,
                uid: userData?.uid || auth.currentUser?.uid || "",
              }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Attendance Passkey" />
          <CardBody>
            <FingerprintVerification
              actionLabel="Register Attendance Passkey"
              mode="create"
              onVerified={(data: any) => {
                if (!data?.registered || !data?.credentialId) {
                  setRegisteredPasskey(null);
                  return;
                }

                setRegisteredPasskey({
                  credentialId: data.credentialId,
                  createdAt: Date.now(),
                });
              }}
            />

            {registeredPasskey ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                <p className="font-semibold">
                  Passkey registered with the server.
                </p>
                <p className="mt-1 break-all">
                  Credential ID: {registeredPasskey.credentialId}
                </p>
                {passkeyCreatedLabel ? (
                  <p className="mt-1 flex items-center gap-1">
                    <FiClock className="h-3.5 w-3.5" />
                    Registered: {passkeyCreatedLabel}
                  </p>
                ) : null}
                <p className="mt-1">
                  Use this device&apos;s fingerprint or biometric lock to verify
                  attendance. The server checks the signature on every mark.
                </p>
              </div>
            ) : null}

            <Button
              fullWidth
              className="mt-4"
              onClick={() => router.push("/student-attendance")}
            >
              Continue to Attendance
            </Button>
          </CardBody>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader title="Face Registration" />
          <CardBody>
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-canvas p-3 text-xs text-ink-soft">
              Status:{" "}
              {faceStatusLoading ? (
                "Checking..."
              ) : faceRegistered ? (
                <Badge tone="success">Registered</Badge>
              ) : (
                <Badge tone="neutral">Not Registered</Badge>
              )}
            </div>

            {!faceRegistered ? (
              <FaceRegistration
                studentId={auth.currentUser?.uid || userData?.uid || ""}
                onRegistered={refreshFaceStatus}
              />
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                Face profile is already registered. You can directly use face
                verification during attendance sessions.
              </div>
            )}

            <Button
              variant="secondary"
              fullWidth
              className="mt-3"
              onClick={refreshFaceStatus}
              disabled={faceStatusLoading}
            >
              {faceStatusLoading ? "Refreshing..." : "Refresh Face Status"}
            </Button>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Quick Actions" />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => router.push("/edit-profile")}
          >
            <FiEdit className="h-4 w-4" /> Edit Profile
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => router.push("/change-password")}
          >
            <FiLock className="h-4 w-4" /> Change Password
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => router.push("/student-attendance")}
          >
            <FiCalendar className="h-4 w-4" /> Attendance
          </Button>
          <Button variant="danger" fullWidth onClick={handleLogout}>
            <FiLogOut className="h-4 w-4" /> Logout
          </Button>
        </CardBody>
      </Card>
    </div>
  );
};

export default StudentProfile;
