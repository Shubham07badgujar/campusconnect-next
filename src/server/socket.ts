// Socket.IO connection handlers (chat rooms, attendance session rooms, messaging).
//
// SECURITY MODEL: every handler below derives the acting user from the verified
// Firebase ID token attached by installSocketAuth (src/server/socket-auth.ts).
// Client-supplied senderId / userId / role fields are ignored on purpose — these
// handlers write through the Admin SDK, which bypasses firestore.rules, so this
// file is the only thing standing between a client and the database.
//
// Clients may still name WHAT they want to act on (chatId, sessionId); the server
// then proves they are allowed to.
import type { Server, Socket } from "socket.io";
import adminApp from "@/lib/server/firebase-admin";
import {
  buildChatLastMessage,
  getPrnFromRecord,
  getStudentProfileByUid,
  resolveChatAttachmentType,
  type ChatAttachment,
} from "@/lib/server/utils";
import {
  getAttendanceJoinedStudentsList,
  getAttendanceSessionJoinMap,
} from "@/lib/server/socket-io";
import {
  installSocketAuth,
  loadChatForParticipant,
  loadSessionForMember,
  registerReauthHandler,
  requireIdentity,
} from "@/server/socket-auth";

type SessionPayload =
  | string
  | { sessionId?: string; studentLocation?: { lat?: unknown; lng?: unknown } };

/** Bounded so a single socket frame cannot push an unbounded document. */
const MAX_MESSAGE_CHARS = 5000;
const MAX_REPLY_PREVIEW_CHARS = 500;

export function registerSocketHandlers(io: Server): void {
  // Gate the connection before any handler can run.
  installSocketAuth(io);

  io.on("connection", (socket: Socket) => {
    registerReauthHandler(socket);

    // Join a chat room (student-teacher conversation) — participants only.
    socket.on("join_chat", async (chatRoomId: unknown) => {
      const identity = requireIdentity(socket);
      if (!identity) return;

      const chatId = String(chatRoomId || "").trim();
      const membership = await loadChatForParticipant(chatId, identity.uid);
      if (!membership) {
        socket.emit("chat_error", { error: "Not authorized for this conversation" });
        return;
      }

      socket.join(chatId);
    });

    socket.on("join_attendance_session", async (sessionPayload: SessionPayload) => {
      const identity = requireIdentity(socket);
      if (!identity) return;

      const normalizedSessionId = String(
        typeof sessionPayload === "string"
          ? sessionPayload
          : sessionPayload?.sessionId || "",
      ).trim();
      if (!normalizedSessionId) return;

      const payloadObject =
        typeof sessionPayload === "object" && sessionPayload !== null
          ? sessionPayload
          : {};
      const candidateLocation = {
        lat: Number(payloadObject?.studentLocation?.lat),
        lng: Number(payloadObject?.studentLocation?.lng),
      };
      const hasStudentLocation =
        !Number.isNaN(candidateLocation.lat) && !Number.isNaN(candidateLocation.lng);

      // Only the owning teacher or an enrolled student may enter the room; this
      // is what stops arbitrary session joining and roster/location snooping.
      const membership = await loadSessionForMember(normalizedSessionId, identity);
      if (!membership) {
        socket.emit("attendance_error", {
          error: "Not authorized for this attendance session",
        });
        return;
      }

      const roomId = `attendance_${normalizedSessionId}`;
      socket.join(roomId);

      socket.emit("attendance-joined-students-snapshot", {
        sessionId: normalizedSessionId,
        students: getAttendanceJoinedStudentsList(normalizedSessionId),
      });

      // Teachers observe the room; only students are tracked as "joined".
      if (membership.role !== "student") return;

      try {
        const firestore = adminApp.firestore();
        const studentProfile = await getStudentProfileByUid(firestore, identity.uid);
        if (!studentProfile) return;

        const joinMap = getAttendanceSessionJoinMap(normalizedSessionId);
        if (!joinMap) return;

        const existingJoinedPayload = joinMap.get(identity.uid) || null;

        const joinedPayload = {
          sessionId: normalizedSessionId,
          studentId: identity.uid,
          studentName: String(
            studentProfile.name || studentProfile.displayName || "Student",
          ),
          prn: getPrnFromRecord(studentProfile),
          joinTimestamp:
            existingJoinedPayload?.joinTimestamp || new Date().toISOString(),
          lat: hasStudentLocation
            ? candidateLocation.lat
            : (existingJoinedPayload?.lat ?? null),
          lng: hasStudentLocation
            ? candidateLocation.lng
            : (existingJoinedPayload?.lng ?? null),
        };

        joinMap.set(identity.uid, joinedPayload);
        io.to(roomId).emit("attendance-student-joined", joinedPayload);
        io.to(roomId).emit("attendance-joined-students-snapshot", {
          sessionId: normalizedSessionId,
          students: getAttendanceJoinedStudentsList(normalizedSessionId),
        });

        if (hasStudentLocation) {
          io.to(roomId).emit("attendance-heatmap-updated", {
            sessionId: normalizedSessionId,
            lat: candidateLocation.lat,
            lng: candidateLocation.lng,
            studentId: identity.uid,
          });
        }
      } catch (error) {
        console.error("Attendance join tracking error:", (error as Error).message);
      }
    });

    socket.on("leave_attendance_session", (sessionPayload: SessionPayload) => {
      const identity = requireIdentity(socket);
      if (!identity) return;

      const normalizedSessionId = String(
        typeof sessionPayload === "string"
          ? sessionPayload
          : sessionPayload?.sessionId || "",
      ).trim();
      if (!normalizedSessionId) return;

      const roomId = `attendance_${normalizedSessionId}`;
      socket.leave(roomId);

      const joinMap = getAttendanceSessionJoinMap(normalizedSessionId);
      if (!joinMap) return;

      // Keyed on the verified uid, so a socket can only remove *itself*.
      if (!joinMap.delete(identity.uid)) return;

      io.to(roomId).emit("attendance-joined-students-snapshot", {
        sessionId: normalizedSessionId,
        students: getAttendanceJoinedStudentsList(normalizedSessionId),
      });
    });

    // Handle message sending
    socket.on("send_message", async (messageData: Record<string, unknown>) => {
      try {
        const identity = requireIdentity(socket);
        if (!identity) return;

        // NOTE: senderId and receiverId are deliberately NOT read from the
        // payload. The sender is the authenticated socket; the recipient is
        // derived from the chat document.
        const { chatId, message, attachment, replyTo } = messageData as {
          chatId?: string;
          message?: string;
          attachment?: ChatAttachment | null;
          replyTo?: Record<string, unknown> | null;
        };

        const normalizedChatId = String(chatId || "").trim();
        const membership = await loadChatForParticipant(
          normalizedChatId,
          identity.uid,
        );
        if (!membership) {
          socket.emit("message_error", {
            error: "Not authorized for this conversation",
          });
          return;
        }

        const normalizedMessage = String(message || "")
          .trim()
          .slice(0, MAX_MESSAGE_CHARS);
        // Server-stamped: a client-supplied timestamp lets a sender forge
        // ordering, so it is ignored.
        const normalizedTimestamp = new Date().toISOString();
        const hasAttachment = Boolean(attachment?.url);

        if (!normalizedMessage && !hasAttachment) {
          socket.emit("message_error", {
            error: "Message text or attachment is required",
          });
          return;
        }

        const normalizedAttachment = hasAttachment
          ? {
              url: String(attachment!.url || "").trim(),
              publicId: String(attachment!.publicId || "").trim(),
              name: String(attachment!.name || "").trim() || "attachment",
              mimeType:
                String(attachment!.mimeType || "").trim() || "application/octet-stream",
              type: resolveChatAttachmentType(attachment!),
              size: Number(attachment!.size) || 0,
              format: String(attachment!.format || "").trim(),
              resourceType: String(attachment!.resourceType || "").trim() || "raw",
              durationSec: Number(attachment!.durationSec) || 0,
            }
          : null;

        const normalizedReplyToCandidate =
          replyTo && typeof replyTo === "object"
            ? {
                messageId: String(replyTo.messageId || "").trim(),
                senderId: String(replyTo.senderId || "").trim(),
                senderName: String(replyTo.senderName || "").trim(),
                message: String(replyTo.message || "")
                  .trim()
                  .slice(0, MAX_REPLY_PREVIEW_CHARS),
                attachmentName: String(replyTo.attachmentName || "").trim(),
                attachmentType: String(replyTo.attachmentType || "")
                  .trim()
                  .toLowerCase(),
              }
            : null;

        const normalizedReplyTo =
          normalizedReplyToCandidate?.messageId && normalizedReplyToCandidate?.senderId
            ? normalizedReplyToCandidate
            : null;

        const persistedMessage = {
          chatId: membership.chatId,
          message: normalizedMessage,
          attachment: normalizedAttachment,
          replyTo: normalizedReplyTo,
          senderId: identity.uid,
          receiverId: membership.counterpartId,
          timestamp: normalizedTimestamp,
          read: false,
        };

        const messageRef = await adminApp
          .firestore()
          .collection("messages")
          .add(persistedMessage);

        const lastMessageText = buildChatLastMessage(
          normalizedMessage,
          normalizedAttachment,
        );

        // Update the chat document with the last message
        await adminApp.firestore().collection("chats").doc(membership.chatId).update({
          lastMessage: lastMessageText,
          lastMessageTimestamp: normalizedTimestamp,
          updatedAt: adminApp.firestore.FieldValue.serverTimestamp(),
        });

        // Only broadcast to others in the room, not back to sender —
        // the sender gets updates via Firestore, avoiding duplicates.
        socket.to(membership.chatId).emit("receive_message", {
          ...persistedMessage,
          id: messageRef.id,
        });

        // Acknowledge message receipt back to sender
        socket.emit("message_sent", {
          success: true,
          messageId: messageRef.id,
        });
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("message_error", {
          error: "Failed to send message",
        });
      }
    });

    // Handle typing status. Membership is implied by room presence, which
    // join_chat already authorized — so this needs no extra Firestore read.
    const emitTyping = (chatId: unknown, isTyping: boolean) => {
      const identity = requireIdentity(socket);
      if (!identity) return;

      const normalizedChatId = String(chatId || "").trim();
      if (!normalizedChatId || !socket.rooms.has(normalizedChatId)) return;

      // The displayed name comes from the verified token, not the payload,
      // so the typing indicator cannot be attributed to someone else.
      socket.to(normalizedChatId).emit("typing_indicator", {
        username: identity.name || "Someone",
        isTyping,
      });
    };

    socket.on("typing", ({ chatId }: { chatId?: string }) => emitTyping(chatId, true));
    socket.on("stop_typing", ({ chatId }: { chatId?: string }) =>
      emitTyping(chatId, false),
    );

    socket.on("disconnect", () => {
      // no-op: attendance join state is cleared explicitly on leave/end
    });
  });
}
