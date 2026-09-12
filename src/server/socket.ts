// Socket.IO connection handlers — verbatim TS port of the legacy Express
// io.on("connection") block (chat rooms, attendance session rooms, messaging).
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

type SessionPayload = string | { sessionId?: string; studentLocation?: { lat?: unknown; lng?: unknown } };

export function registerSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    console.log("New client connected:", socket.id);

    // Join a chat room (student-teacher conversation)
    socket.on("join_chat", (chatRoomId: string) => {
      socket.join(chatRoomId);
      console.log(`User ${socket.id} joined room: ${chatRoomId}`);
    });

    socket.on("join_attendance_session", async (sessionPayload: SessionPayload) => {
      const normalizedSessionId = String(
        typeof sessionPayload === "string"
          ? sessionPayload
          : sessionPayload?.sessionId || "",
      ).trim();
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
      const roomId = `attendance_${normalizedSessionId}`;
      if (!normalizedSessionId) {
        return;
      }

      socket.join(roomId);
      console.log(`User ${socket.id} joined attendance room: ${roomId}`);

      const joinedSnapshot = getAttendanceJoinedStudentsList(normalizedSessionId);
      socket.emit("attendance-joined-students-snapshot", {
        sessionId: normalizedSessionId,
        students: joinedSnapshot,
      });

      const connectedUserId = String(socket.handshake?.query?.userId || "").trim();
      if (!connectedUserId) {
        return;
      }

      try {
        const firestore = adminApp.firestore();
        const studentProfile = await getStudentProfileByUid(firestore, connectedUserId);
        if (!studentProfile) {
          return;
        }

        const roleValue = String(studentProfile.role || "").toLowerCase();
        if (roleValue && roleValue !== "student") {
          return;
        }

        const joinMap = getAttendanceSessionJoinMap(normalizedSessionId);
        if (!joinMap) {
          return;
        }

        const existingJoinedPayload = joinMap.get(connectedUserId) || null;

        const joinedPayload = {
          sessionId: normalizedSessionId,
          studentId: connectedUserId,
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

        joinMap.set(connectedUserId, joinedPayload);
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
            studentId: connectedUserId,
          });
        }
      } catch (error) {
        console.error("Attendance join tracking error:", (error as Error).message);
      }
    });

    socket.on("leave_attendance_session", (sessionPayload: SessionPayload) => {
      const normalizedSessionId = String(
        typeof sessionPayload === "string"
          ? sessionPayload
          : sessionPayload?.sessionId || "",
      ).trim();

      if (!normalizedSessionId) {
        return;
      }

      const roomId = `attendance_${normalizedSessionId}`;
      socket.leave(roomId);

      const connectedUserId = String(socket.handshake?.query?.userId || "").trim();
      if (!connectedUserId) {
        return;
      }

      const joinMap = getAttendanceSessionJoinMap(normalizedSessionId);
      if (!joinMap) {
        return;
      }

      const removed = joinMap.delete(connectedUserId);
      if (!removed) {
        return;
      }

      io.to(roomId).emit("attendance-joined-students-snapshot", {
        sessionId: normalizedSessionId,
        students: getAttendanceJoinedStudentsList(normalizedSessionId),
      });
    });

    // Handle message sending
    socket.on("send_message", async (messageData: Record<string, unknown>) => {
      try {
        const { chatId, message, senderId, receiverId, timestamp, attachment, replyTo } =
          messageData as {
            chatId?: string;
            message?: string;
            senderId?: string;
            receiverId?: string;
            timestamp?: string;
            attachment?: ChatAttachment | null;
            replyTo?: Record<string, unknown> | null;
          };

        const normalizedMessage = String(message || "").trim();
        const normalizedTimestamp =
          String(timestamp || "").trim() || new Date().toISOString();
        const hasAttachment = Boolean(attachment?.url);

        if (!chatId || !senderId || !receiverId || (!normalizedMessage && !hasAttachment)) {
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
                  .slice(0, 500),
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

        const messageRef = await adminApp.firestore().collection("messages").add({
          chatId,
          message: normalizedMessage,
          attachment: normalizedAttachment,
          replyTo: normalizedReplyTo,
          senderId,
          receiverId,
          timestamp: normalizedTimestamp,
          read: false,
        });

        const lastMessageText = buildChatLastMessage(
          normalizedMessage,
          normalizedAttachment,
        );

        // Update the chat document with the last message
        await adminApp.firestore().collection("chats").doc(chatId).update({
          lastMessage: lastMessageText,
          lastMessageTimestamp: normalizedTimestamp,
          updatedAt: adminApp.firestore.FieldValue.serverTimestamp(),
        });

        // Only broadcast to others in the room, not back to sender —
        // the sender gets updates via Firestore, avoiding duplicates.
        socket.to(chatId).emit("receive_message", {
          ...messageData,
          message: normalizedMessage,
          attachment: normalizedAttachment,
          replyTo: normalizedReplyTo,
          timestamp: normalizedTimestamp,
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

    // Handle typing status
    socket.on("typing", ({ chatId, username }: { chatId: string; username: string }) => {
      socket.to(chatId).emit("typing_indicator", { username, isTyping: true });
    });

    socket.on(
      "stop_typing",
      ({ chatId, username }: { chatId: string; username: string }) => {
        socket.to(chatId).emit("typing_indicator", { username, isTyping: false });
      },
    );

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
}
