"use client";

import React from "react";
import { UserCheck, UsersRound, UserX, Clock3 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import StatCard from "@/components/ui/StatCard";
import Button from "@/components/ui/Button";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";

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

const formatDateTime = (value) => {
  const dateValue = toDateValue(value);
  return dateValue ? dateValue.toLocaleString() : "-";
};

export default function PastSessionDetailsModal({
  isOpen,
  onClose,
  session,
  records,
  loading,
  onExportCsv,
  onExportPdf,
  onDelete,
  deleting = false,
}) {
  const recordsList = Array.isArray(records) ? records : [];
  const presentStudents = Array.isArray(session?.presentStudents)
    ? session.presentStudents
    : [];
  const absentStudents = Array.isArray(session?.absentStudents)
    ? session.absentStudents
    : [];

  return (
    <Modal
      open={Boolean(isOpen && session)}
      onClose={onClose}
      size="xl"
      title="Session Details"
      description={
        session
          ? `${session.subjectName || "Subject"} | ${session.date || "-"} | Session: ${String(session.sessionId || session.id || "-")}`
          : undefined
      }
      footer={
        <>
          <Button
            type="button"
            onClick={() => onExportCsv?.(session, recordsList)}
            disabled={loading}
            size="sm"
          >
            Export CSV
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onExportPdf?.(session, recordsList)}
            disabled={loading}
            size="sm"
          >
            Export PDF
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => onDelete?.(session)}
            disabled={loading || deleting}
            loading={deleting}
            size="sm"
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </>
      }
    >
      {session ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <StatCard
              label="Present"
              value={Number(session.presentCount || 0)}
              icon={UserCheck}
              tone="success"
            />
            <StatCard
              label="Enrolled"
              value={Number(session.enrolledStudentsCount || 0)}
              icon={UsersRound}
              tone="info"
            />
            <StatCard
              label="Absent"
              value={Number(session.absentCount || 0)}
              icon={UserX}
              tone="danger"
            />
            <StatCard
              label="Ended At"
              value={
                <span className="text-sm font-medium">
                  {formatDateTime(session.endTimeMs || session.endTime)}
                </span>
              }
              icon={Clock3}
              tone="neutral"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
            <div className="rounded-card border border-emerald-200 bg-emerald-50 p-3">
              <p className="font-semibold text-emerald-800">Present Students</p>
              <div className="cc-scroll mt-1 max-h-32 overflow-y-auto text-emerald-700">
                {presentStudents.length > 0 ? (
                  presentStudents.map((student) => (
                    <p key={`${student.studentId || student.prn}_present`}>
                      {(student.studentName || "Student") +
                        (student.prn ? ` (${student.prn})` : "")}
                    </p>
                  ))
                ) : (
                  <p>No present students listed.</p>
                )}
              </div>
            </div>

            <div className="rounded-card border border-rose-200 bg-rose-50 p-3">
              <p className="font-semibold text-rose-800">Absent Students</p>
              <div className="cc-scroll mt-1 max-h-32 overflow-y-auto text-rose-700">
                {absentStudents.length > 0 ? (
                  absentStudents.map((student) => (
                    <p key={`${student.studentId || student.prn}_absent`}>
                      {(student.studentName || "Student") +
                        (student.prn ? ` (${student.prn})` : "")}
                    </p>
                  ))
                ) : (
                  <p>No absent students listed.</p>
                )}
              </div>
            </div>
          </div>

          <div className="cc-scroll overflow-x-auto rounded-card border border-line bg-surface">
            <Table>
              <THead>
                <tr>
                  <TH>PRN</TH>
                  <TH>Student</TH>
                  <TH>Student ID</TH>
                  <TH>Method</TH>
                  <TH>Marked At</TH>
                </tr>
              </THead>
              <TBody>
                {recordsList.map((record) => (
                  <TR key={record.recordId || record.id}>
                    <TD>{record.prn || "-"}</TD>
                    <TD className="font-medium">{record.studentName || "-"}</TD>
                    <TD>{record.studentId || "-"}</TD>
                    <TD>{record.method || "-"}</TD>
                    <TD>{formatDateTime(record.timestamp)}</TD>
                  </TR>
                ))}
                {recordsList.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-ink-soft"
                    >
                      {loading
                        ? "Loading session records..."
                        : "No attendance records found for this session."}
                    </td>
                  </tr>
                ) : null}
              </TBody>
            </Table>
          </div>

          {Array.isArray(session.absentStudentIds) &&
          session.absentStudentIds.length > 0 ? (
            <div className="rounded-card border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <p className="font-semibold">Absent Student IDs</p>
              <p className="mt-1 break-all">
                {session.absentStudentIds.join(", ")}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
