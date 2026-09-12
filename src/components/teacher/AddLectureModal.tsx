"use client";

import React, { useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const TIME_SLOTS = [
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:00", end: "12:00" },
  { start: "12:00", end: "13:00" },
  { start: "13:00", end: "14:00" },
  { start: "14:00", end: "15:00" },
  { start: "15:00", end: "16:00" },
  { start: "16:00", end: "17:00" },
];

export default function AddLectureModal({
  open,
  onClose,
  onSubmit,
  branch,
  year,
  semester,
  allowedSubjects,
  isSubmitting,
}) {
  const [formData, setFormData] = useState({
    subjectName: "",
    day: "Monday",
    startTime: "09:00",
    endTime: "10:00",
  });

  const slotOptions = useMemo(() => {
    return TIME_SLOTS.map((slot) => ({
      label: `${slot.start} - ${slot.end}`,
      ...slot,
    }));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit({
      ...formData,
      branch,
      year,
      semester,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Lecture Slot"
      description="Add a lecture to the shared class timetable."
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Branch">
            <Input value={branch} readOnly />
          </Field>
          <Field label="Year">
            <Input value={year} readOnly />
          </Field>
          <Field label="Semester">
            <Input value={`Semester ${semester}`} readOnly />
          </Field>
        </div>

        <Field label="Subject" htmlFor="lecture-subject" required>
          <Select
            id="lecture-subject"
            required
            value={formData.subjectName}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                subjectName: event.target.value,
              }))
            }
          >
            <option value="">Select Subject</option>
            {allowedSubjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Day" htmlFor="lecture-day">
            <Select
              id="lecture-day"
              value={formData.day}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, day: event.target.value }))
              }
            >
              {DAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Start" htmlFor="lecture-start">
            <Select
              id="lecture-start"
              value={formData.startTime}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  startTime: event.target.value,
                }))
              }
            >
              {slotOptions.map((slot) => (
                <option key={slot.start} value={slot.start}>
                  {slot.start}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="End" htmlFor="lecture-end">
            <Select
              id="lecture-end"
              value={formData.endTime}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  endTime: event.target.value,
                }))
              }
            >
              {slotOptions.map((slot) => (
                <option key={slot.end} value={slot.end}>
                  {slot.end}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? "Saving..." : "Add Lecture"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
