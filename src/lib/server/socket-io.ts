import type { Server } from "socket.io";

// The Socket.IO server lives on the custom server's module graph, while route
// handlers are compiled into Next's own graph — a plain module singleton would
// give each graph its own copy. globalThis is the shared bridge.
const IO_KEY = Symbol.for("campusconnect.io");

export function setIO(io: Server): void {
  (globalThis as Record<symbol, unknown>)[IO_KEY] = io;
}

export function getIO(): Server | null {
  return ((globalThis as Record<symbol, unknown>)[IO_KEY] as Server) ?? null;
}

// ---- shared in-memory joined-students state (single-process) ----
// Lives here (not in socket.ts) so BOTH the socket handlers and the attendance
// route handlers (end-session cleanup) can reach the same maps via globalThis.

export type JoinedStudentPayload = {
  sessionId: string;
  studentId: string;
  studentName: string;
  prn: string;
  joinTimestamp: string;
  lat: number | null;
  lng: number | null;
};

const JOINED_KEY = Symbol.for("campusconnect.attendance-joined");

function joinedStore(): Map<string, Map<string, JoinedStudentPayload>> {
  const globalStore = globalThis as Record<symbol, unknown>;
  if (!globalStore[JOINED_KEY]) {
    globalStore[JOINED_KEY] = new Map<string, Map<string, JoinedStudentPayload>>();
  }
  return globalStore[JOINED_KEY] as Map<string, Map<string, JoinedStudentPayload>>;
}

export const getAttendanceSessionJoinMap = (
  sessionId: string,
): Map<string, JoinedStudentPayload> | null => {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return null;
  }

  const store = joinedStore();
  if (!store.has(normalizedSessionId)) {
    store.set(normalizedSessionId, new Map());
  }
  return store.get(normalizedSessionId)!;
};

export const clearAttendanceSessionJoinMap = (sessionId: string): void => {
  joinedStore().delete(String(sessionId || "").trim());
};

export const getAttendanceJoinedStudentsList = (
  sessionId: string,
): JoinedStudentPayload[] => {
  const joinMap = getAttendanceSessionJoinMap(sessionId);
  if (!joinMap) {
    return [];
  }

  return Array.from(joinMap.values()).sort(
    (a, b) => new Date(b.joinTimestamp).getTime() - new Date(a.joinTimestamp).getTime(),
  );
};
