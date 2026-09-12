"use client";

import React from "react";
import LectureSlotCard from "@/components/teacher/LectureSlotCard";
import { TableWrap } from "@/components/ui/Table";

const toMinutes = (timeText = "") => {
  const [h, m] = String(timeText || "00:00")
    .split(":")
    .map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
};

const overlaps = (aStart, aEnd, bStart, bEnd) => {
  return aStart < bEnd && bStart < aEnd;
};

export default function TimetableGrid({
  lectures,
  days,
  timeSlots,
  currentTeacherId,
}) {
  const getLectureForCell = (day, slot) => {
    const slotStart = toMinutes(slot.start);
    const slotEnd = toMinutes(slot.end);

    return lectures.find((lecture) => {
      if ((lecture.day || "") !== day) return false;
      const lectureStart = toMinutes(lecture.startTime || "");
      const lectureEnd = toMinutes(lecture.endTime || "");
      return overlaps(slotStart, slotEnd, lectureStart, lectureEnd);
    });
  };

  return (
    <TableWrap>
      <table className="min-w-[920px] w-full border-collapse text-sm">
        <thead>
          <tr className="bg-brand-600 text-white">
            <th className="border border-brand-500 p-3 text-left font-semibold">
              Time
            </th>
            {days.map((day) => (
              <th
                key={day}
                className="border border-brand-500 p-3 text-center font-semibold"
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map((slot) => (
            <tr key={slot.label}>
              <td className="border border-line bg-slate-50 p-3 font-medium text-ink-soft">
                {slot.label}
              </td>
              {days.map((day) => {
                const lecture = getLectureForCell(day, slot);
                return (
                  <td
                    key={`${day}-${slot.label}`}
                    className="min-h-[100px] border border-line p-2 align-top"
                  >
                    {lecture ? (
                      <LectureSlotCard
                        lecture={lecture}
                        isOwnLecture={lecture.teacherId === currentTeacherId}
                      />
                    ) : (
                      <div className="h-[78px] rounded-lg border border-dashed border-line bg-slate-50/60" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
