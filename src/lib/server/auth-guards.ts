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

const verifyToken = async (req: NextRequest): Promise<DecodedToken | null> => {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    return await adminApp.auth().verifyIdToken(token);
  } catch {
    return null;
  }
};

/** Admin = `admin` custom claim OR an `admins/{uid}` Firestore document. */
export async function requireAdmin(
  req: NextRequest,
): Promise<AdminGuard | GuardFailure> {
  const decodedToken = await verifyToken(req);
  if (!decodedToken) {
    return fail(401, "No authorization token provided");
  }

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
  const decodedToken = await verifyToken(req);
  if (!decodedToken) {
    return fail(401, "No authorization token provided");
  }

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
  if (teacher.ok) {
    return { ok: true, uid: teacher.uid, token: teacher.token };
  }

  const adminGuard = await requireAdmin(req);
  if (adminGuard.ok) {
    return adminGuard;
  }

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
  const decodedToken = await verifyToken(req);
  if (!decodedToken) {
    return fail(401, "No authorization token provided");
  }

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
  const decodedToken = await verifyToken(req);
  if (!decodedToken) {
    return fail(401, "Invalid or missing authorization token");
  }
  return { ok: true, uid: decodedToken.uid, token: decodedToken };
}
