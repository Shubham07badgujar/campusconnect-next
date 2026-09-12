"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Clock, MapPin, Radius } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

const haversineDistanceMeters = (pointA: any, pointB: any) => {
  const lat1 = Number(pointA?.lat);
  const lon1 = Number(pointA?.lng);
  const lat2 = Number(pointB?.lat);
  const lon2 = Number(pointB?.lng);

  if ([lat1, lon1, lat2, lon2].some((value) => Number.isNaN(value))) {
    return Number.POSITIVE_INFINITY;
  }

  const R = 6371000;
  const toRad = (degrees: any) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

export default function AttendanceSessionCard({
  session,
  studentLocation,
  onMark,
  onLeave,
  marking,
  biometricReady,
  verificationReady,
  verificationLabel = "biometric",
}: any) {
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const distance = useMemo(() => {
    if (!session?.teacherLocation || !studentLocation) {
      return Number.POSITIVE_INFINITY;
    }
    return haversineDistanceMeters(studentLocation, session.teacherLocation);
  }, [session, studentLocation]);

  const allowedDistance = Number(session?.allowedDistanceMeters || 30);
  const isVerificationReady =
    typeof verificationReady === "boolean" ? verificationReady : biometricReady;
  const startMs =
    Number(session?.startTimeMs) || Date.parse(session?.startTime || "") || 0;
  const windowMs = Number(session?.attendanceWindowSeconds || 60) * 1000;
  const endMs = startMs + windowMs;
  const remainingMs = Math.max(endMs - nowMs, 0);
  const remainingTotalSeconds = Math.ceil(remainingMs / 1000);
  const remainingMinutes = Math.floor(remainingTotalSeconds / 60);
  const remainingSeconds = remainingTotalSeconds % 60;
  const timerText = `${String(remainingMinutes).padStart(2, "0")}:${String(
    remainingSeconds,
  ).padStart(2, "0")}`;

  if (!session) {
    return (
      <Card>
        <CardBody className="text-sm text-ink-soft">
          Join an active session from the list to continue with attendance
          verification.
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="border-emerald-200">
      <CardHeader
        title={
          <span className="flex items-center gap-2 text-emerald-800">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Clock className="h-3.5 w-3.5" />
            </span>
            Active Attendance Session
          </span>
        }
        description={
          <span className="text-emerald-700">
            {session.subjectName} | {session.date}
          </span>
        }
        actions={
          <Badge tone="success">
            <Clock className="h-3.5 w-3.5" /> {timerText}
          </Badge>
        }
        className="border-emerald-100 bg-emerald-50/60"
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-line bg-slate-50/70 p-3 text-sm text-ink-soft">
            <p className="flex items-center gap-1.5 font-medium text-ink">
              <MapPin className="h-3.5 w-3.5 text-ink-faint" /> Distance from
              classroom
            </p>
            <p className="mt-1">
              {Number.isFinite(distance)
                ? `${distance.toFixed(1)} meters`
                : "Location unavailable"}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-slate-50/70 p-3 text-sm text-ink-soft">
            <p className="flex items-center gap-1.5 font-medium text-ink">
              <Radius className="h-3.5 w-3.5 text-ink-faint" /> Allowed radius
            </p>
            <p className="mt-1">{allowedDistance} meters</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="success"
            disabled={!isVerificationReady || marking}
            onClick={onMark}
          >
            {marking ? "Marking..." : "Mark Attendance"}
          </Button>
          {onLeave ? (
            <Button variant="secondary" onClick={onLeave}>
              Leave Session
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-ink-faint">
          Distance is shown for reference and may vary by network/GPS accuracy.
        </p>
        {!isVerificationReady ? (
          <p className="text-xs text-amber-700">
            Complete {verificationLabel} verification before marking attendance.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
