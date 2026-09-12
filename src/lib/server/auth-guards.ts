// Authentication / authorization guards — ported from the legacy monolith's
// verifyAdminFromRequest / verifyTeacherFromRequest / verifyStudentFromRequest
// helpers. Semantics (custom claims + Firestore-doc fallbacks) are unchanged.
import { NextRequest, NextResponse } from "next/server";
import type { auth as adminAuth, firestore as adminFirestore } from "firebase-admin";
import adminApp from "@/lib/server/firebase-admin";

export type DecodedToken = adminAuth.DecodedIdToken;

export type GuardFailure = { ok: false; response: NextResponse };

export type AdminGuard = { ok: true; uid: string; token: DecodedToken };
export type TeacherGuard = {
  ok: true;
  uid: string;
  token: DecodedToken;
  teacherDoc: adminFirestore.DocumentSnapshot;
};
export type StudentGuard = {
  ok: true;
  uid: string;
  token: DecodedToken;
  studentData: Record<string, unknown>;
};
export type AuthedGuard = { ok: true; uid: string; token: DecodedToken };

const fail = (status: number, message: string): GuardFailure => ({
  ok: false,
  response: NextResponse.json({ message }, { status }),
});

const getBearerToken = (req: NextRequest): string => {
  const authHeader = String(req.headers.get("authorization") || "").trim();
  if (!authHeader) return "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
};

const SERVICE_UNAVAILABLE_MESSAGE =
  "Authentication service is temporarily unavailable. Please try again shortly.";

// Distinguishes a genuinely bad credential (verifyIdToken rejected the token)
// from the Admin SDK being unavailable. A rejected token carries a Firebase
// `auth/*` error code; an initialization failure (e.g. a missing
// FIREBASE_SERVICE_ACCOUNT_BASE64 on the host) throws a plain Error from our
// lazy loader with no code, or an `app/*` code — neither starts with "auth/".
const isInvalidTokenError = (err: unknown): boolean => {
  const source = err as { code?: unknown; errorInfo?: { code?: unknown } } | null;
  const code = source?.code ?? source?.errorInfo?.code;
  return typeof code === "string" && code.startsWith("auth/");
};

// Verifies the Bearer token and returns the decoded claims, or a ready-to-send
// GuardFailure that names the real problem: a missing token (401), a bad/expired
// token (401), or the Admin SDK being unreachable (503) — the last of which used
// to masquerade as "No authorization token provided", hiding server misconfig.
const authenticate = async (
  req: NextRequest,
): Promise<{ ok: true; token: DecodedToken } | GuardFailure> => {
  const token = getBearerToken(req);
  if (!token) return fail(401, "No authorization token provided");
  try {
    return { ok: true, token: await adminApp.auth().verifyIdToken(token) };
  } catch (err) {
    if (isInvalidTokenError(err)) {
      return fail(401, "Invalid or expired authorization token");
    }
    console.error(
      "Firebase Admin SDK unavailable during token verification:",
      err,
    );
    return fail(503, SERVICE_UNAVAILABLE_MESSAGE);
  }
};

/** Admin = `admin` custom claim OR an `admins/{uid}` Firestore document. */
export async function requireAdmin(
  req: NextRequest,
): Promise<AdminGuard | GuardFailure> {
  const authed = await authenticate(req);
  if (authed.ok === false) return authed;
  const decodedToken = authed.token;

  if (decodedToken.admin === true) {
    return { ok: true, uid: decodedToken.uid, token: decodedToken };
  }

  const adminDoc = await adminApp
    .firestore()
    .collection("admins")
    .doc(decodedToken.uid)
    .get();
  if (!adminDoc.exists) {
    return fail(403, "Only admins are authorized");
  }

  return { ok: true, uid: decodedToken.uid, token: decodedToken };
}

/** Teacher = `teacher` custom claim OR a `teachers/{uid}` Firestore document. */
export async function requireTeacher(
  req: NextRequest,
): Promise<TeacherGuard | GuardFailure> {
  const authed = await authenticate(req);
  if (authed.ok === false) return authed;
  const decodedToken = authed.token;

  const teacherDoc = await adminApp
    .firestore()
    .collection("teachers")
    .doc(decodedToken.uid)
    .get();

  if (decodedToken.teacher !== true && !teacherDoc.exists) {
    return fail(403, "Only teachers are authorized");
  }

  return { ok: true, uid: decodedToken.uid, token: decodedToken, teacherDoc };
}

/** Teacher OR admin (admin claim / admins doc). */
export async function requireTeacherOrAdmin(
  req: NextRequest,
): Promise<AuthedGuard | GuardFailure> {
  const teacher = await requireTeacher(req);
  if (teacher.ok === true) {
    return { ok: true, uid: teacher.uid, token: teacher.token };
  }
  // Only a 403 ("not a teacher") should fall through to the admin check;
  // a missing/invalid token (401) or an unavailable Admin SDK (503) must
  // propagate as-is instead of being masked as a generic authorization error.
  if (teacher.response.status !== 403) return teacher;

  const adminGuard = await requireAdmin(req);
  if (adminGuard.ok === true) {
    return adminGuard;
  }
  if (adminGuard.response.status !== 403) return adminGuard;

  return fail(403, "Only teachers or admins are authorized");
}

/**
 * Student = `student` claim OR users/{uid}.role === "student" OR a
 * students/{uid} doc. Returns the merged profile exactly like the legacy
 * helper: users-doc fields override students-doc fields.
 */
export async function requireStudent(
  req: NextRequest,
): Promise<StudentGuard | GuardFailure> {
  const authed = await authenticate(req);
  if (authed.ok === false) return authed;
  const decodedToken = authed.token;

  const firestore = adminApp.firestore();
  const [userDoc, studentDoc] = await Promise.all([
    firestore.collection("users").doc(decodedToken.uid).get(),
    firestore.collection("students").doc(decodedToken.uid).get(),
  ]);

  const userData = userDoc.exists ? userDoc.data() || {} : {};
  const studentData = studentDoc.exists ? studentDoc.data() || {} : {};
  const role = String((userData as { role?: unknown }).role || "").toLowerCase();

  if (decodedToken.student !== true && role !== "student" && !studentDoc.exists) {
    return fail(403, "Only students are authorized");
  }

  return {
    ok: true,
    uid: decodedToken.uid,
    token: decodedToken,
    studentData: {
      ...studentData,
      ...userData,
      uid: decodedToken.uid,
    },
  };
}

/** Any signed-in Firebase user. */
export async function requireAuthenticatedUser(
  req: NextRequest,
): Promise<AuthedGuard | GuardFailure> {
  const authed = await authenticate(req);
  if (authed.ok === false) return authed;
  return { ok: true, uid: authed.token.uid, token: authed.token };
}
