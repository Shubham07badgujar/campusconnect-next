// WebAuthn (passkey) helpers — challenge lifecycle + credential store, ported
// verbatim from the legacy monolith. Origin/rpID resolution is adapted for the
// same-origin Next.js world: the expected origin is the request's own origin
// (the app and API share one host), plus optional extras from env.
import type { NextRequest } from "next/server";
import type { firestore as adminFirestore } from "firebase-admin";
import { FieldValue } from "@/lib/server/firebase-admin";
import {
  WEBAUTHN_CHALLENGES_COLLECTION,
  WEBAUTHN_CREDENTIALS_COLLECTION,
  WEBAUTHN_CHALLENGE_TTL_MS,
} from "@/lib/server/constants";

type AnyRecord = Record<string, any>;

const extraOrigins = (): string[] =>
  String(process.env.WEBAUTHN_EXTRA_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const requestOrigin = (req: NextRequest): string => {
  const originHeader = String(req.headers.get("origin") || "").trim();
  if (originHeader) {
    return originHeader.replace(/\/+$/, "");
  }

  // Same-origin fetches may omit the Origin header on GET; fall back to Host.
  const host = String(req.headers.get("host") || "").trim();
  if (host) {
    const proto = String(req.headers.get("x-forwarded-proto") || "").trim() ||
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  }

  return "http://localhost:3000";
};

/** Origins accepted by verifyRegistrationResponse / verifyAuthenticationResponse. */
export const getExpectedOrigins = (req: NextRequest): string[] => {
  return Array.from(new Set([requestOrigin(req), ...extraOrigins()]));
};

/** rpID candidates = hostnames of every accepted origin. */
export const getWebauthnRpIdCandidates = (req: NextRequest): string[] => {
  const ids = new Set<string>();
  for (const origin of getExpectedOrigins(req)) {
    try {
      ids.add(new URL(origin).hostname);
    } catch {
      // ignore malformed origins
    }
  }
  if (ids.size === 0) {
    ids.add("localhost");
  }
  return Array.from(ids);
};

export const resolveWebauthnRpId = (req: NextRequest): string => {
  try {
    return new URL(requestOrigin(req)).hostname;
  } catch {
    return "localhost";
  }
};

export const createWebauthnChallenge = async (
  firestore: adminFirestore.Firestore,
  {
    studentId,
    type,
    sessionId = "",
    challenge,
  }: { studentId: string; type: string; sessionId?: string; challenge: string },
): Promise<string> => {
  const challengeRef = firestore.collection(WEBAUTHN_CHALLENGES_COLLECTION).doc();
  const nowMs = Date.now();

  await challengeRef.set({
    challengeId: challengeRef.id,
    studentId,
    type,
    sessionId,
    challenge,
    createdAtMs: nowMs,
    expiresAtMs: nowMs + WEBAUTHN_CHALLENGE_TTL_MS,
    used: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  return challengeRef.id;
};

export const consumeWebauthnChallenge = async (
  firestore: adminFirestore.Firestore,
  {
    challengeId,
    studentId,
    type,
    sessionId = "",
  }: { challengeId: string; studentId: string; type: string; sessionId?: string },
): Promise<string> => {
  const challengeRef = firestore
    .collection(WEBAUTHN_CHALLENGES_COLLECTION)
    .doc(challengeId);
  const challengeDoc = await challengeRef.get();

  if (!challengeDoc.exists) {
    throw new Error("Passkey challenge not found. Request a new one.");
  }

  const data = (challengeDoc.data() || {}) as AnyRecord;
  if (data.studentId !== studentId) {
    throw new Error("Passkey challenge does not belong to this student.");
  }
  if (data.type !== type) {
    throw new Error("Passkey challenge type mismatch.");
  }
  if (sessionId && data.sessionId !== sessionId) {
    throw new Error("Passkey challenge does not match this session.");
  }
  if (data.used) {
    throw new Error("Passkey challenge already used. Request a new one.");
  }
  if (Number(data.expiresAtMs) < Date.now()) {
    throw new Error("Passkey challenge expired. Request a new one.");
  }

  await challengeRef.update({ used: true, usedAtMs: Date.now() });
  return String(data.challenge || "");
};

export type StoredPasskey = {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  registeredAtMs?: number;
};

export const getStoredPasskeys = async (
  firestore: adminFirestore.Firestore,
  studentId: string,
): Promise<StoredPasskey[]> => {
  const docSnap = await firestore
    .collection(WEBAUTHN_CREDENTIALS_COLLECTION)
    .doc(studentId)
    .get();

  if (!docSnap.exists) {
    return [];
  }

  const credentials = (docSnap.data() as AnyRecord)?.credentials;
  return Array.isArray(credentials)
    ? credentials.filter((item) => item && item.credentialId && item.publicKey)
    : [];
};

export const updateStoredPasskeyCounter = async (
  firestore: adminFirestore.Firestore,
  studentId: string,
  credentialId: string,
  newCounter: unknown,
): Promise<void> => {
  if (!Number.isFinite(Number(newCounter))) {
    return;
  }

  const passkeyRef = firestore
    .collection(WEBAUTHN_CREDENTIALS_COLLECTION)
    .doc(studentId);
  const docSnap = await passkeyRef.get();
  if (!docSnap.exists) {
    return;
  }

  const credentials = (((docSnap.data() as AnyRecord)?.credentials || []) as AnyRecord[]).map(
    (item) =>
      item.credentialId === credentialId
        ? { ...item, counter: Number(newCounter) }
        : item,
  );

  await passkeyRef.update({
    credentials,
    updatedAt: FieldValue.serverTimestamp(),
  });
};
