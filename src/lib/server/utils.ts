// Shared server-side helpers ported verbatim from the legacy Express monolith.
import type { firestore as adminFirestore } from "firebase-admin";

export const toMillis = (value: unknown): number => {
  if (!value) return 0;
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const parsed = new Date(value as string | number | Date).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const haversineDistanceMeters = (
  pointA: { lat?: unknown; lng?: unknown } | null | undefined,
  pointB: { lat?: unknown; lng?: unknown } | null | undefined,
): number => {
  const lat1 = Number(pointA?.lat);
  const lon1 = Number(pointA?.lng);
  const lat2 = Number(pointB?.lat);
  const lon2 = Number(pointB?.lng);

  if ([lat1, lon1, lat2, lon2].some((value) => Number.isNaN(value))) {
    return Number.POSITIVE_INFINITY;
  }

  const R = 6371000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const getPrnFromRecord = (data: Record<string, unknown> = {}): string => {
  return String(data.rollNo || data.rollNumber || data.prn || "")
    .trim()
    .toUpperCase();
};

export const normalizePrn = (value: unknown = ""): string => {
  return String(value || "")
    .trim()
    .toUpperCase();
};

export const normalizeEmail = (value: unknown = ""): string => {
  const email = String(value || "")
    .trim()
    .toLowerCase();
  return email.includes("@") ? email : "";
};

export const normalizeDeviceId = (value: unknown = ""): string => {
  return String(value || "").trim();
};

export const getStudentProfileByUid = async (
  firestore: adminFirestore.Firestore,
  uid: string,
): Promise<Record<string, unknown> | null> => {
  const [userDoc, studentDoc] = await Promise.all([
    firestore.collection("users").doc(uid).get(),
    firestore.collection("students").doc(uid).get(),
  ]);

  if (!userDoc.exists && !studentDoc.exists) {
    return null;
  }

  return {
    uid,
    ...(studentDoc.exists ? studentDoc.data() || {} : {}),
    ...(userDoc.exists ? userDoc.data() || {} : {}),
  };
};

// ---- chat attachment helpers ----

export type ChatAttachment = {
  url?: string;
  publicId?: string;
  name?: string;
  mimeType?: string;
  type?: string;
  size?: number;
  format?: string;
  resourceType?: string;
  durationSec?: number;
};

export const resolveChatAttachmentType = (
  attachment: ChatAttachment = {},
): string => {
  const explicitType = String(attachment.type || "").toLowerCase();
  if (["image", "video", "audio", "voice", "document"].includes(explicitType)) {
    return explicitType;
  }

  const mimeType = String(attachment.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
};

export const buildChatLastMessage = (
  textMessage: string = "",
  attachment: ChatAttachment | null = null,
): string => {
  const trimmedText = String(textMessage || "").trim();
  if (trimmedText) {
    return trimmedText;
  }

  if (!attachment || !attachment.url) {
    return "";
  }

  const type = resolveChatAttachmentType(attachment);
  if (type === "image") return "Image attachment";
  if (type === "video") return "Video attachment";
  if (type === "voice") return "Voice message";
  if (type === "audio") return "Audio attachment";

  const fileName = String(attachment.name || "").trim();
  return fileName ? `Document: ${fileName}` : "Document attachment";
};
