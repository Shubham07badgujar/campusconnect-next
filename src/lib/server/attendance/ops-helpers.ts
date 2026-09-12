// Attendance/timetable operation helpers — ported verbatim from the legacy
// Express monolith (server.js). Kept out of shared.ts so shared stays frozen.
import type { firestore as adminFirestore } from "firebase-admin";
import { toMillis } from "@/lib/server/utils";
import { getSessionStudentIds } from "@/lib/server/attendance/shared";

type AnyRecord = Record<string, any>;

export const isTimeRangeOverlapping = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean => {
  return aStart < bEnd && bStart < aEnd;
};

export const getSessionPresentStudentIds = async (
  firestore: adminFirestore.Firestore,
  sessionData: AnyRecord,
  sessionId: string,
  recordsCache: Map<string, string[]>,
): Promise<string[]> => {
  const explicit = Array.from(
    new Set(
      [
        ...(Array.isArray(sessionData.presentStudentIds)
          ? sessionData.presentStudentIds
          : []),
        ...(Array.isArray(sessionData.presentStudents)
          ? sessionData.presentStudents.map(
              (student: AnyRecord) => student.studentId,
            )
          : []),
      ]
        .map((studentId) => String(studentId || "").trim())
        .filter(Boolean),
    ),
  );

  if (explicit.length > 0) {
    return explicit;
  }

  if (!sessionId) {
    return [];
  }

  if (recordsCache.has(sessionId)) {
    return recordsCache.get(sessionId);
  }

  const recordsSnapshot = await firestore
    .collection("attendance_records")
    .where("sessionId", "==", sessionId)
    .get();

  const ids = Array.from(
    new Set(
      recordsSnapshot.docs
        .map((docSnap) => String(docSnap.data()?.studentId || "").trim())
        .filter(Boolean),
    ),
  );

  recordsCache.set(sessionId, ids);
  return ids;
};

export const buildSubjectAttendanceIndex = async (
  firestore: adminFirestore.Firestore,
  subjectId: string,
) => {
  const sessionsSnapshot = await firestore
    .collection("attendance_sessions")
    .where("subjectId", "==", subjectId)
    .where("status", "==", "ended")
    .get();

  const sessions = sessionsSnapshot.docs
    .map(
      (docSnap): AnyRecord => ({ id: docSnap.id, ...(docSnap.data() || {}) }),
    )
    .sort(
      (a, b) =>
        Number(a.startTimeMs || toMillis(a.startTime) || 0) -
        Number(b.startTimeMs || toMillis(b.startTime) || 0),
    );

  const attendanceByStudentId = new Map<
    string,
    { totalClasses: number; attendedClasses: number }
  >();
  const recordsCache = new Map<string, string[]>();

  for (const session of sessions) {
    const sessionId = String(session.sessionId || session.id || "").trim();
    const enrolledIds = getSessionStudentIds(session);
    const presentIds = await getSessionPresentStudentIds(
      firestore,
      session,
      sessionId,
      recordsCache,
    );
    const presentSet = new Set(presentIds);
    const targetStudentIds = Array.from(
      new Set([...(enrolledIds.length > 0 ? enrolledIds : []), ...presentIds]),
    );

    if (targetStudentIds.length === 0) {
      continue;
    }

    targetStudentIds.forEach((studentId) => {
      const current = attendanceByStudentId.get(studentId) || {
        totalClasses: 0,
        attendedClasses: 0,
      };

      attendanceByStudentId.set(studentId, {
        totalClasses: current.totalClasses + 1,
        attendedClasses:
          current.attendedClasses + (presentSet.has(studentId) ? 1 : 0),
      });
    });
  }

  return {
    sessions,
    attendanceByStudentId,
  };
};
