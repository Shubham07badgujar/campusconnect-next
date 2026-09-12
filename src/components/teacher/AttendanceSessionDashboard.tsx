"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  UserCheck,
  UsersRound,
  Clock3,
  BookOpen,
  Timer,
  QrCode,
  RefreshCw,
  FileDown,
  Square,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import Button from "@/components/ui/Button";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";

const QRScanner = dynamic(() => import("@/components/teacher/QRScanner"), {
  ssr: false,
});
const ClassroomHeatmap = dynamic(
  () => import("@/components/teacher/ClassroomHeatmap"),
  { ssr: false },
);

const toDateValue = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    return value.toDate();
  }
  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatTime = (value) => {
  const dateValue = toDateValue(value);
  return dateValue ? dateValue.toLocaleTimeString() : "-";
};

const toCsv = (session, records) => {
  const header = [
    "PRN",
    "Student Name",
    "Subject",
    "Date",
    "Status",
    "Timestamp",
  ];
  const rows = records.map((record) => [
    record.prn || "",
    record.studentName || "",
    session.subjectName || "",
    session.date || "",
    "Present",
    record.timestamp || "",
  ]);

  return [header, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");
};

const formatMethod = (method) => {
  const value = String(method || "")
    .trim()
    .toLowerCase();
  if (value === "biometric") return "Fingerprint";
  if (value === "face_recognition") return "Face";
  if (value === "teacher_scan") return "Teacher QR";
  return method || "-";
};

export default function AttendanceSessionDashboard({
  session,
  records,
  joinedStudents,
  heatmapPoints,
  onScanStudent,
  onRefresh,
  refreshing = false,
  onEndSession,
  ending = false,
}) {
  const [showScanner, setShowScanner] = useState(false);
  const safeRecords = Array.isArray(records) ? records : [];
  const safeJoinedStudents = Array.isArray(joinedStudents)
    ? joinedStudents
    : [];
  const enrolled = Number(session?.enrolledStudentsCount || 0);
  const present = safeRecords.length;
  const joined = safeJoinedStudents.length;
  const pending = Math.max(enrolled - present, 0);

  const sortedRecords = useMemo(() => {
    return [...safeRecords].sort((a, b) =>
      String(a.studentName || "").localeCompare(String(b.studentName || "")),
    );
  }, [safeRecords]);

  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

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

  const exportCsv = () => {
    const csv = toCsv(session, sortedRecords);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${session.subjectId || "subject"}_${session.date || "attendance"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Present" value={present} icon={UserCheck} tone="success" />
        <StatCard label="Joined" value={joined} icon={UsersRound} tone="info" />
        <StatCard label="Pending" value={pending} icon={Clock3} tone="warning" />
        <StatCard
          label="Subject"
          value={session.subjectName}
          icon={BookOpen}
          tone="brand"
        />
        <StatCard
          label="Time Remaining"
          value={timerText}
          icon={Timer}
          tone="info"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setShowScanner((prev) => !prev)}>
          <QrCode className="h-4 w-4" />
          {showScanner ? "Hide QR Scanner" : "Scan Student QR"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onRefresh}
          loading={refreshing}
          disabled={refreshing}
        >
          {!refreshing ? <RefreshCw className="h-4 w-4" /> : null}
          {refreshing ? "Refreshing..." : "Refresh Session Data"}
        </Button>
        <Button type="button" onClick={exportCsv}>
          <FileDown className="h-4 w-4" /> Export CSV (Google Sheets)
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={ending}
          loading={ending}
          onClick={onEndSession}
        >
          {!ending ? <Square className="h-4 w-4" /> : null}
          {ending ? "Ending..." : "End Session"}
        </Button>
      </div>

      {showScanner ? <QRScanner onDetected={onScanStudent} /> : null}

      <ClassroomHeatmap
        teacherLocation={session.teacherLocation}
        points={heatmapPoints}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      <Card className="overflow-hidden">
        <CardHeader
          title="Students Joined Session"
          actions={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              loading={refreshing}
              disabled={refreshing}
            >
              {!refreshing ? <RefreshCw className="h-3.5 w-3.5" /> : null}
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
          }
        />
        <div className="cc-scroll max-h-64 overflow-y-auto">
          <Table>
            <THead>
              <tr>
                <TH>Student</TH>
                <TH>Roll Number / ID</TH>
                <TH>Joined At</TH>
              </tr>
            </THead>
            <TBody>
              {safeJoinedStudents.map((student) => (
                <TR
                  key={`${student.studentId || student.prn || "student"}_joined`}
                >
                  <TD className="font-medium">
                    {student.studentName || "Student"}
                  </TD>
                  <TD>{student.prn || student.studentId || "-"}</TD>
                  <TD>{formatTime(student.joinTimestamp)}</TD>
                </TR>
              ))}
              {safeJoinedStudents.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-sm text-ink-soft"
                  >
                    No students have joined the session yet.
                  </td>
                </tr>
              ) : null}
            </TBody>
          </Table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Live Attendance List"
          actions={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              loading={refreshing}
              disabled={refreshing}
            >
              {!refreshing ? <RefreshCw className="h-3.5 w-3.5" /> : null}
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
          }
        />
        <div className="cc-scroll max-h-80 overflow-y-auto">
          <Table>
            <THead>
              <tr>
                <TH>PRN</TH>
                <TH>Student</TH>
                <TH>Method</TH>
                <TH>Time</TH>
              </tr>
            </THead>
            <TBody>
              {sortedRecords.map((record) => (
                <TR key={record.recordId}>
                  <TD>{record.prn || "-"}</TD>
                  <TD className="font-medium">
                    {record.studentName || record.studentId}
                  </TD>
                  <TD>{formatMethod(record.method)}</TD>
                  <TD>{formatTime(record.timestamp)}</TD>
                </TR>
              ))}
              {sortedRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-ink-soft"
                  >
                    No attendance records yet.
                  </td>
                </tr>
              ) : null}
            </TBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
