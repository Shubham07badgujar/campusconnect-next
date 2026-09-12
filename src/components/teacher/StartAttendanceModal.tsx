"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Field";
import Button from "@/components/ui/Button";

const todayISO = () => new Date().toISOString().slice(0, 10);
const getDayFromDate = (dateValue) => {
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { weekday: "long" });
};

export default function StartAttendanceModal({
  isOpen,
  lectures,
  onClose,
  onStart,
  submitting,
  defaultEnforceDistanceCheck = false,
}) {
  const [date, setDate] = useState(todayISO());
  const [lectureId, setLectureId] = useState("");
  const [attendanceWindowSeconds, setAttendanceWindowSeconds] = useState(60);
  const [enforceDistanceCheck, setEnforceDistanceCheck] = useState(
    Boolean(defaultEnforceDistanceCheck),
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setEnforceDistanceCheck(Boolean(defaultEnforceDistanceCheck));
  }, [defaultEnforceDistanceCheck, isOpen]);

  const durationOptions = [
    { value: 60, label: "1 minute" },
    { value: 120, label: "2 minutes" },
    { value: 180, label: "3 minutes" },
    { value: 240, label: "4 minutes" },
    { value: 300, label: "5 minutes" },
    { value: 600, label: "10 minutes" },
  ];

  const options = useMemo(() => {
    return (Array.isArray(lectures) ? lectures : []).map((entry) => ({
      key: entry.id,
      label: `${entry.subjectName || entry.subject || "Subject"} | ${entry.day || "-"} | ${entry.startTime || ""}-${entry.endTime || ""}`,
      value: entry,
    }));
  }, [lectures]);

  const selected = options.find((item) => item.key === lectureId)?.value;
  const selectedDateDay = getDayFromDate(date);
  const timetableDay = String(selected?.day || "").trim();
  const isMatchingDay =
    !timetableDay ||
    !selectedDateDay ||
    timetableDay.toLowerCase() === selectedDateDay.toLowerCase();

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!selected) {
      return;
    }

    if (!isMatchingDay) {
      return;
    }

    onStart({
      lectureId: selected.id,
      date,
      attendanceWindowSeconds,
      enforceDistanceCheck,
    });
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Start Attendance Session"
      description="Select a timetable lecture and date to start live attendance."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Field label="Date">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>

        <Field label="Lecture">
          <Select
            value={lectureId}
            onChange={(e) => setLectureId(e.target.value)}
            required
          >
            <option value="">Select lecture from timetable</option>
            {options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Attendance Time Slot">
          <Select
            value={attendanceWindowSeconds}
            onChange={(e) =>
              setAttendanceWindowSeconds(Number(e.target.value) || 60)
            }
          >
            {durationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="rounded-card border border-line bg-canvas p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={enforceDistanceCheck}
              onChange={(event) =>
                setEnforceDistanceCheck(Boolean(event.target.checked))
              }
              className="mt-1 h-4 w-4 rounded border-line text-brand-600"
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                Enforce student location radius
              </span>
              <span className="block text-xs text-ink-soft">
                If enabled, students must be within classroom distance to mark
                attendance. If disabled, location is informational only.
              </span>
            </span>
          </label>
        </div>

        {selected ? (
          <div className="rounded-card border border-line bg-canvas p-3 text-sm text-ink-soft">
            <p>
              <span className="font-medium text-ink">Subject:</span>{" "}
              {selected.subjectName || selected.subject || "-"}
            </p>
            <p>
              <span className="font-medium text-ink">Class:</span>{" "}
              {selected.branch || "-"} {selected.year || ""}
              {selected.semester ? ` / Sem ${selected.semester}` : ""}
            </p>
            <p>
              <span className="font-medium text-ink">Timetable Day:</span>{" "}
              {timetableDay || "-"}
            </p>
            <p>
              <span className="font-medium text-ink">Selected Date Day:</span>{" "}
              {selectedDateDay || "-"}
            </p>
            {!isMatchingDay ? (
              <p className="mt-1 text-xs text-danger">
                Selected date does not match timetable day for this lecture.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="success"
            disabled={submitting || !isMatchingDay}
            loading={submitting}
          >
            {submitting ? "Starting..." : "Start Attendance Session"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
