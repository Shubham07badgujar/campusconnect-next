// Socket.IO authentication and authorization.
//
// WHY THIS EXISTS: the realtime channel is a third door into our data, next to
// (1) the browser talking to Firestore directly, governed by firestore.rules,
// and (2) the browser calling our API routes, governed by src/lib/server/auth-guards.ts.
// Socket handlers write through the Admin SDK, which bypasses firestore.rules by
// design — so the rules protecting `messages` and `chats` are NEVER consulted on
// this path. Every identity and membership decision therefore has to be made here.
//
// The rule this module enforces: identity comes from a verified Firebase ID token
// and nothing else. Client-supplied senderId / userId / role fields are ignored.
import type { Server, Socket } from "socket.io";
import adminApp from "@/lib/server/firebase-admin";

/** Verified identity attached to every connected socket. Never client-supplied. */
export type SocketIdentity = {
  uid: string;
  isAdmin: boolean;
  isTeacher: boolean;
  /** Token expiry, epoch seconds. Sockets outlive tokens, so this is re-checked. */
  exp: number;
  name: string;
};

export type AuthedSocket = Socket & { data: { identity?: SocketIdentity } };

export const AUTH_ERROR = "UNAUTHENTICATED";
export const AUTH_UNAVAILABLE = "AUTH_UNAVAILABLE";

/**
 * Distinguishes a rejected token from an unreachable Admin SDK, mirroring
 * src/lib/server/auth-guards.ts. A rejected token carries a Firebase `auth/*`
 * code; an initialization failure does not.
 */
const isInvalidTokenError = (err: unknown): boolean => {
  const source = err as { code?: unknown; errorInfo?: { code?: unknown } } | null;
  const code = source?.code ?? source?.errorInfo?.code;
  return typeof code === "string" && code.startsWith("auth/");
};

const readHandshakeToken = (socket: Socket): string => {
  // `auth` is the correct channel: unlike `query`, it does not end up in proxy
  // access logs or the Referer header.
  const fromAuth = (socket.handshake.auth as Record<string, unknown> | undefined)?.token;
  return String(fromAuth || "").trim();
};

/** Verifies a Firebase ID token and returns the identity it proves. */
export const verifyIdentity = async (token: string): Promise<SocketIdentity> => {
  const decoded = await adminApp.auth().verifyIdToken(token);
  return {
    uid: decoded.uid,
    isAdmin: decoded.admin === true,
    isTeacher: decoded.teacher === true,
    exp: Number(decoded.exp) || 0,
    name: String(decoded.name || "").trim(),
  };
};

/**
 * Connection gate. Runs before any handler is registered, so an unauthenticated
 * socket never reaches a single event. Fails closed in every branch.
 */
export const installSocketAuth = (io: Server): void => {
  io.use(async (socket, next) => {
    const token = readHandshakeToken(socket);
    if (!token) {
      next(new Error(AUTH_ERROR));
      return;
    }

    try {
      (socket as AuthedSocket).data.identity = await verifyIdentity(token);
      next();
    } catch (error) {
      if (isInvalidTokenError(error)) {
        next(new Error(AUTH_ERROR));
        return;
      }
      // Admin SDK unavailable — reject rather than fall open, but say so
      // distinctly so a misconfigured deploy is diagnosable.
      console.error(
        "Socket auth unavailable:",
        (error as Error)?.message ?? String(error),
      );
      next(new Error(AUTH_UNAVAILABLE));
    }
  });
};

/**
 * Returns the socket's verified identity, or null if it is missing or its token
 * has expired. Sockets are long-lived and ID tokens last about an hour, so this
 * is checked on every privileged event rather than only at connect time.
 * The client refreshes in place via the `reauthenticate` event.
 */
export const currentIdentity = (socket: Socket): SocketIdentity | null => {
  const identity = (socket as AuthedSocket).data?.identity;
  if (!identity) return null;
  if (identity.exp && Date.now() >= identity.exp * 1000) return null;
  return identity;
};

/** Identity for a privileged action; notifies the client when re-auth is needed. */
export const requireIdentity = (socket: Socket): SocketIdentity | null => {
  const identity = currentIdentity(socket);
  if (!identity) {
    socket.emit("auth_expired", {
      error: "Session expired. Refreshing credentials.",
    });
    return null;
  }
  return identity;
};

/**
 * Lets a live socket swap in a fresh token without dropping the connection —
 * which matters because a drop mid-lecture would interrupt attendance.
 * A failed refresh leaves the previous (expired) identity in place, so the
 * socket stays unauthorized rather than silently regaining access.
 */
export const registerReauthHandler = (socket: Socket): void => {
  socket.on("reauthenticate", async (payload: unknown, ack?: (r: unknown) => void) => {
    const token = String(
      (payload as { token?: unknown } | undefined)?.token || "",
    ).trim();
    if (!token) {
      ack?.({ ok: false });
      return;
    }

    try {
      const next = await verifyIdentity(token);
      const existing = (socket as AuthedSocket).data.identity;
      // A refreshed token must belong to the same account; otherwise this is an
      // attempt to change identity on an established connection.
      if (existing && existing.uid !== next.uid) {
        ack?.({ ok: false });
        return;
      }
      (socket as AuthedSocket).data.identity = next;
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false });
    }
  });
};

// ---- membership checks (authorization, as opposed to authentication) ----

export type ChatMembership = {
  chatId: string;
  studentId: string;
  teacherId: string;
  /** The other participant, derived from the chat document — never from the client. */
  counterpartId: string;
};

/**
 * Loads a chat only if the caller is one of its two participants.
 * Returns null for a non-existent chat and for a non-participant alike, so the
 * caller cannot distinguish the two and use this to probe for chat IDs.
 */
export const loadChatForParticipant = async (
  chatId: string,
  uid: string,
): Promise<ChatMembership | null> => {
  const normalizedChatId = String(chatId || "").trim();
  if (!normalizedChatId || !uid) return null;

  const snapshot = await adminApp
    .firestore()
    .collection("chats")
    .doc(normalizedChatId)
    .get();
  if (!snapshot.exists) return null;

  const data = (snapshot.data() || {}) as Record<string, unknown>;
  const studentId = String(data.studentId || "").trim();
  const teacherId = String(data.teacherId || "").trim();

  if (uid !== studentId && uid !== teacherId) return null;

  return {
    chatId: normalizedChatId,
    studentId,
    teacherId,
    counterpartId: uid === studentId ? teacherId : studentId,
  };
};

export type SessionMembership = {
  sessionId: string;
  role: "teacher" | "student";
  session: Record<string, unknown>;
};

/**
 * Loads an attendance session only if the caller owns it (teacher) or is on its
 * enrolled roster (student). This is what stops arbitrary session joining and
 * stops a student appearing in a class they are not part of.
 */
export const loadSessionForMember = async (
  sessionId: string,
  identity: SocketIdentity,
): Promise<SessionMembership | null> => {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) return null;

  const snapshot = await adminApp
    .firestore()
    .collection("attendance_sessions")
    .doc(normalizedSessionId)
    .get();
  if (!snapshot.exists) return null;

  const session = (snapshot.data() || {}) as Record<string, unknown>;

  if (String(session.teacherId || "").trim() === identity.uid) {
    return { sessionId: normalizedSessionId, role: "teacher", session };
  }

  const enrolled = Array.isArray(session.enrolledStudentIds)
    ? session.enrolledStudentIds.map((value) => String(value))
    : [];
  if (enrolled.includes(identity.uid)) {
    return { sessionId: normalizedSessionId, role: "student", session };
  }

  return null;
};
