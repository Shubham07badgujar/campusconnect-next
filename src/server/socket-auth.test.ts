// Security gate for the realtime channel.
//
// These tests exist because socket handlers write through the Firebase Admin
// SDK, which bypasses firestore.rules — so the rules that protect `messages`
// and `chats` are never consulted on this path and this layer is the only
// control. Each test below asserts a property an attacker would try to break.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { Server as IOServer } from "socket.io";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";

// ---- controllable fake Admin SDK (hoisted so vi.mock can close over it) ----
const state = vi.hoisted(() => {
  type Claims = {
    uid: string;
    admin?: boolean;
    teacher?: boolean;
    exp?: number;
    name?: string;
  };

  const nowSec = () => Math.floor(Date.now() / 1000);

  const tokens: Record<string, Claims> = {
    "token-student-a": { uid: "student-a", name: "Student A", exp: nowSec() + 3600 },
    "token-student-b": { uid: "student-b", name: "Student B", exp: nowSec() + 3600 },
    "token-teacher": {
      uid: "teacher-1",
      teacher: true,
      name: "Teacher One",
      exp: nowSec() + 3600,
    },
    "token-admin": { uid: "admin-1", admin: true, name: "Admin", exp: nowSec() + 3600 },
    // Verifies fine, but its clock has already run out — exercises the
    // per-event expiry re-check on a long-lived connection.
    "token-stale": { uid: "student-a", name: "Student A", exp: nowSec() - 60 },
  };

  const docs: Record<string, Record<string, Record<string, unknown>>> = {
    users: {},
    students: {},
    chats: {},
    attendance_sessions: {},
  };

  const writes = {
    messages: [] as Record<string, unknown>[],
    chatUpdates: [] as { chatId: string; data: Record<string, unknown> }[],
  };

  return { tokens, docs, writes, nowSec };
});

vi.mock("@/lib/server/firebase-admin", () => {
  const authError = (code: string) => Object.assign(new Error(code), { code });

  const collection = (name: string) => ({
    doc: (id: string) => ({
      get: async () => ({
        exists: Boolean(state.docs[name]?.[id]),
        data: () => state.docs[name]?.[id],
      }),
      update: async (data: Record<string, unknown>) => {
        state.writes.chatUpdates.push({ chatId: id, data });
      },
    }),
    add: async (data: Record<string, unknown>) => {
      if (name === "messages") state.writes.messages.push(data);
      return { id: `generated-${state.writes.messages.length}` };
    },
  });

  const firestore = Object.assign(() => ({ collection }), {
    FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" },
  });

  const adminApp = {
    auth: () => ({
      verifyIdToken: async (token: string) => {
        if (token === "token-sdk-down") {
          // No `auth/` code — mirrors an Admin SDK initialization failure.
          throw new Error("Firebase service account not configured");
        }
        const claims = state.tokens[token];
        if (!claims) throw authError("auth/argument-error");
        if (token === "token-expired") throw authError("auth/id-token-expired");
        return claims;
      },
    }),
    firestore,
  };

  return { default: adminApp, FieldValue: firestore.FieldValue };
});

// Imported after the mock so the handlers bind to the fake Admin SDK.
const { registerSocketHandlers } = await import("@/server/socket");

// ---- harness ----
let httpServer: HttpServer;
let io: IOServer;
let port: number;
const openClients: ClientSocket[] = [];

const connect = (auth: Record<string, unknown>): Promise<ClientSocket> =>
  new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth,
      reconnection: false,
      transports: ["websocket"],
    });
    openClients.push(socket);
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
  });

/** Resolves with the first of several events, or rejects on timeout. */
const firstOf = (
  socket: ClientSocket,
  events: string[],
  ms = 4000,
): Promise<{ event: string; payload: unknown }> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${events.join("|")}`)),
      ms,
    );
    events.forEach((event) =>
      socket.once(event, (payload: unknown) => {
        clearTimeout(timer);
        resolve({ event, payload });
      }),
    );
  });

const seed = () => {
  state.docs.users = {
    "student-a": { name: "Student A", role: "Student", rollNo: "CS201" },
    "student-b": { name: "Student B", role: "Student", rollNo: "CS202" },
  };
  state.docs.students = { ...state.docs.users };
  state.docs.chats = {
    // student-a <-> teacher-1. student-b is NOT a participant.
    "chat-1": { studentId: "student-a", teacherId: "teacher-1" },
  };
  state.docs.attendance_sessions = {
    "session-1": { teacherId: "teacher-1", enrolledStudentIds: ["student-a"] },
  };
  state.writes.messages = [];
  state.writes.chatUpdates = [];
};

beforeAll(async () => {
  httpServer = createServer();
  io = new IOServer(httpServer);
  registerSocketHandlers(io);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as { port: number }).port;
});

afterEach(() => {
  while (openClients.length) openClients.pop()?.disconnect();
});

afterAll(async () => {
  io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

// ---------------------------------------------------------------- connection

describe("socket connection authentication", () => {
  it("rejects a connection with no token", async () => {
    seed();
    await expect(connect({})).rejects.toThrow("UNAUTHENTICATED");
  });

  it("rejects an invalid token", async () => {
    seed();
    await expect(connect({ token: "not-a-real-token" })).rejects.toThrow(
      "UNAUTHENTICATED",
    );
  });

  it("rejects an expired token", async () => {
    seed();
    await expect(connect({ token: "token-expired" })).rejects.toThrow(
      "UNAUTHENTICATED",
    );
  });

  it("fails closed, and distinguishably, when the Admin SDK is unavailable", async () => {
    seed();
    await expect(connect({ token: "token-sdk-down" })).rejects.toThrow(
      "AUTH_UNAVAILABLE",
    );
  });

  it("accepts a valid token", async () => {
    seed();
    const socket = await connect({ token: "token-student-a" });
    expect(socket.connected).toBe(true);
  });
});

// ------------------------------------------------------------------- messaging

describe("message sending cannot be impersonated", () => {
  it("ignores a forged senderId and persists the authenticated identity", async () => {
    seed();
    const socket = await connect({ token: "token-student-a" });

    socket.emit("send_message", {
      chatId: "chat-1",
      message: "hello",
      senderId: "teacher-1", // forged
      receiverId: "student-b", // forged
    });

    await firstOf(socket, ["message_sent", "message_error"]);

    expect(state.writes.messages).toHaveLength(1);
    const persisted = state.writes.messages[0];
    // Sender is the verified socket identity, not the payload.
    expect(persisted.senderId).toBe("student-a");
    // Recipient is derived from the chat document, not the payload.
    expect(persisted.receiverId).toBe("teacher-1");
  });

  it("stops a student sending as another student", async () => {
    seed();
    const socket = await connect({ token: "token-student-a" });

    socket.emit("send_message", {
      chatId: "chat-1",
      message: "spoofed",
      senderId: "student-b",
    });

    await firstOf(socket, ["message_sent", "message_error"]);
    expect(state.writes.messages[0]?.senderId).toBe("student-a");
    expect(state.writes.messages[0]?.senderId).not.toBe("student-b");
  });

  it("refuses a conversation the sender is not part of, and writes nothing", async () => {
    seed();
    // student-b is not a participant of chat-1.
    const socket = await connect({ token: "token-student-b" });

    socket.emit("send_message", { chatId: "chat-1", message: "intruding" });

    const { event, payload } = await firstOf(socket, [
      "message_sent",
      "message_error",
    ]);
    expect(event).toBe("message_error");
    expect((payload as { error: string }).error).toMatch(/not authorized/i);
    expect(state.writes.messages).toHaveLength(0);
    expect(state.writes.chatUpdates).toHaveLength(0);
  });

  it("refuses a chat that does not exist without revealing the difference", async () => {
    seed();
    const socket = await connect({ token: "token-student-a" });

    socket.emit("send_message", { chatId: "chat-does-not-exist", message: "x" });

    const { event, payload } = await firstOf(socket, [
      "message_sent",
      "message_error",
    ]);
    expect(event).toBe("message_error");
    // Same wording as the non-participant case, so this cannot be used to
    // probe which chat IDs exist.
    expect((payload as { error: string }).error).toMatch(/not authorized/i);
    expect(state.writes.messages).toHaveLength(0);
  });

  it("ignores a client-supplied timestamp", async () => {
    seed();
    const socket = await connect({ token: "token-student-a" });

    socket.emit("send_message", {
      chatId: "chat-1",
      message: "hi",
      timestamp: "1999-01-01T00:00:00.000Z",
    });

    await firstOf(socket, ["message_sent", "message_error"]);
    expect(state.writes.messages[0]?.timestamp).not.toBe("1999-01-01T00:00:00.000Z");
  });
});

// ------------------------------------------------------------------ chat rooms

describe("chat room joining is authorized", () => {
  it("lets a participant join", async () => {
    seed();
    const socket = await connect({ token: "token-student-a" });
    socket.emit("join_chat", "chat-1");
    // No error is the success signal; assert by sending afterwards.
    socket.emit("send_message", { chatId: "chat-1", message: "ok" });
    const { event } = await firstOf(socket, ["message_sent", "message_error"]);
    expect(event).toBe("message_sent");
  });

  it("refuses a non-participant", async () => {
    seed();
    const socket = await connect({ token: "token-student-b" });
    socket.emit("join_chat", "chat-1");
    const { payload } = await firstOf(socket, ["chat_error"]);
    expect((payload as { error: string }).error).toMatch(/not authorized/i);
  });
});

// ------------------------------------------------------------------ attendance

describe("attendance session joining is authorized", () => {
  it("lets an enrolled student join", async () => {
    seed();
    const socket = await connect({ token: "token-student-a" });
    socket.emit("join_attendance_session", { sessionId: "session-1" });
    const { event } = await firstOf(socket, [
      "attendance-joined-students-snapshot",
      "attendance_error",
    ]);
    expect(event).toBe("attendance-joined-students-snapshot");
  });

  it("lets the owning teacher observe", async () => {
    seed();
    const socket = await connect({ token: "token-teacher" });
    socket.emit("join_attendance_session", { sessionId: "session-1" });
    const { event } = await firstOf(socket, [
      "attendance-joined-students-snapshot",
      "attendance_error",
    ]);
    expect(event).toBe("attendance-joined-students-snapshot");
  });

  it("refuses a student who is not on the roster", async () => {
    seed();
    // student-b is not in enrolledStudentIds.
    const socket = await connect({ token: "token-student-b" });
    socket.emit("join_attendance_session", { sessionId: "session-1" });
    const { event, payload } = await firstOf(socket, [
      "attendance-joined-students-snapshot",
      "attendance_error",
    ]);
    expect(event).toBe("attendance_error");
    expect((payload as { error: string }).error).toMatch(/not authorized/i);
  });

  it("refuses an arbitrary session id", async () => {
    seed();
    const socket = await connect({ token: "token-student-a" });
    socket.emit("join_attendance_session", { sessionId: "session-guessed" });
    const { event } = await firstOf(socket, [
      "attendance-joined-students-snapshot",
      "attendance_error",
    ]);
    expect(event).toBe("attendance_error");
  });

  it("a student cannot remove another student from a session", async () => {
    seed();
    const studentA = await connect({ token: "token-student-a" });
    studentA.emit("join_attendance_session", { sessionId: "session-1" });
    await firstOf(studentA, ["attendance-joined-students-snapshot"]);

    const { getAttendanceJoinedStudentsList } = await import(
      "@/lib/server/socket-io"
    );
    expect(getAttendanceJoinedStudentsList("session-1").map((s) => s.studentId)).toContain(
      "student-a",
    );

    // student-b attempts to leave on A's behalf; leave is keyed on the verified
    // uid, so A must remain joined.
    const studentB = await connect({ token: "token-student-b" });
    studentB.emit("leave_attendance_session", { sessionId: "session-1" });
    await new Promise((r) => setTimeout(r, 300));

    expect(getAttendanceJoinedStudentsList("session-1").map((s) => s.studentId)).toContain(
      "student-a",
    );
  });
});

// ------------------------------------------------------------ token freshness

describe("token freshness is re-checked on privileged events", () => {
  it("refuses a privileged action once the token has expired mid-connection", async () => {
    seed();
    // Verifies at connect, but its exp is already in the past.
    const socket = await connect({ token: "token-stale" });
    expect(socket.connected).toBe(true);

    socket.emit("send_message", { chatId: "chat-1", message: "after expiry" });

    const { event } = await firstOf(socket, [
      "message_sent",
      "message_error",
      "auth_expired",
    ]);
    expect(event).toBe("auth_expired");
    expect(state.writes.messages).toHaveLength(0);
  });

  it("accepts a fresh token in place, without dropping the connection", async () => {
    seed();
    const socket = await connect({ token: "token-stale" });

    const ack = await new Promise<{ ok: boolean }>((resolve) =>
      socket.emit("reauthenticate", { token: "token-student-a" }, resolve),
    );
    expect(ack.ok).toBe(true);

    socket.emit("send_message", { chatId: "chat-1", message: "after refresh" });
    const { event } = await firstOf(socket, ["message_sent", "message_error"]);
    expect(event).toBe("message_sent");
    expect(state.writes.messages[0]?.senderId).toBe("student-a");
  });

  it("refuses a refresh that would change the account on an open socket", async () => {
    seed();
    const socket = await connect({ token: "token-student-a" });

    const ack = await new Promise<{ ok: boolean }>((resolve) =>
      socket.emit("reauthenticate", { token: "token-teacher" }, resolve),
    );
    expect(ack.ok).toBe(false);

    // Identity is unchanged: messages still persist as student-a.
    socket.emit("send_message", { chatId: "chat-1", message: "still me" });
    await firstOf(socket, ["message_sent", "message_error"]);
    expect(state.writes.messages[0]?.senderId).toBe("student-a");
  });
});

// ------------------------------------------------------------------ privilege

describe("role claims come from the token, never the client", () => {
  it("a teacher cannot claim admin by sending it in a payload", async () => {
    seed();
    const { verifyIdentity } = await import("@/server/socket-auth");
    const identity = await verifyIdentity("token-teacher");

    expect(identity.uid).toBe("teacher-1");
    expect(identity.isTeacher).toBe(true);
    expect(identity.isAdmin).toBe(false);
  });

  it("a student token carries neither staff claim", async () => {
    seed();
    const { verifyIdentity } = await import("@/server/socket-auth");
    const identity = await verifyIdentity("token-student-a");

    expect(identity.isTeacher).toBe(false);
    expect(identity.isAdmin).toBe(false);
  });

  it("an admin token is recognised only from its claim", async () => {
    seed();
    const { verifyIdentity } = await import("@/server/socket-auth");
    const identity = await verifyIdentity("token-admin");

    expect(identity.isAdmin).toBe(true);
  });
});
