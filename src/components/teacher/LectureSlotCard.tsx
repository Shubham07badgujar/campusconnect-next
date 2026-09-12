"use client";

import React from "react";
import Badge from "@/components/ui/Badge";

const toMinutes = (timeText = "") => {
  const [h, m] = String(timeText || "00:00")
    .split(":")
    .map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
};

const getLectureStatus = (lecture) => {
  const now = new Date();
  const currentDay = now.toLocaleDateString("en-US", { weekday: "long" });
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if ((lecture.day || "") !== currentDay) {
    return "Scheduled";
  }

  const start = toMinutes(lecture.startTime || "");
  const end = toMinutes(lecture.endTime || "");

  if (currentMinutes < start) return "Scheduled";
  if (currentMinutes >= start && currentMinutes < end) return "Ongoing";
  return "Completed";
};

const statusTone = {
  Scheduled: "info",
  Ongoing: "success",
  Completed: "neutral",
} as const;

export default function LectureSlotCard({ lecture, isOwnLecture }) {
  const status = getLectureStatus(lecture);

  return (
    <div
      className={`rounded-lg border p-2.5 text-xs transition ${
        isOwnLecture
          ? "border-brand-300 bg-brand-50"
          : "border-line bg-white"
      }`}
    >
      <div className="font-semibold text-ink">{lecture.subjectName}</div>
      <div className="text-ink-soft">{lecture.teacherName}</div>
      <div className="text-ink-soft">
        {lecture.startTime} - {lecture.endTime}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={statusTone[status] || "info"}>{status}</Badge>
        {isOwnLecture ? <Badge tone="brand">Your Lecture</Badge> : null}
      </div>
    </div>
  );
}
