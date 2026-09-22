// The public teacher directory.
//
// WHY THIS EXISTS: students legitimately need some teacher information — the
// staff directory they start a chat from, the chat header, and the
// subject-to-teacher map on their dashboard. But `teachers` documents also hold
// staff personal data: mobile number, and the loginId / authEmail that IS the
// sign-in identifier.
//
// Firestore has no field-level read rules — a document is readable or it is
// not — so "let students read the name but not the mobile number" cannot be
// expressed in firestore.rules. The standard answer is a second collection
// holding only the safe fields. `teachers` is then locked to staff, and
// everyone reads `teacherDirectory` instead.
//
// This is derived data: it is written by the server whenever a teacher is
// created, updated or deleted, and nothing else may write it.
import type { firestore as adminFirestore } from "firebase-admin";

export const TEACHER_DIRECTORY = "teacherDirectory";

export type TeacherDirectoryEntry = {
  uid: string;
  name: string;
  photoURL: string;
  /** Institutional contact address — the staff directory is meant to be usable. */
  email: string;
  dept: string;
  department: string;
  /** Already shown to students today, e.g. "Teacher One (PM01)". */
  teacherId: string;
  /** Needed to map a subject to the teacher who teaches it. */
  assignments: { branch: string; year: string; subjects: string[] }[];
  assignedSubjects: string[];
  assignedBranches: string[];
  assignedYears: string[];
  updatedAt: string;
};

/**
 * Projects a teacher record down to what a student may see.
 *
 * Deliberately EXCLUDED, and the reason each is excluded:
 *   mobile / phone      — personal contact details, not directory information
 *   contactEmail        — same value as `email`; one copy is enough
 *   authEmail / loginId — the sign-in identifier; publishing it hands out half
 *                         of every staff credential
 *   jobProfile          — employment detail, of no use to a student
 *
 * `email` and `teacherId` ARE included because the existing student screens
 * already display them (the directory lists the address, the dashboard renders
 * "Name (PM01)"). Drop them here if the institution would rather they were not
 * visible — nothing else depends on them being present.
 */
export const buildTeacherDirectoryEntry = (
  uid: string,
  teacher: Record<string, unknown>,
): TeacherDirectoryEntry => {
  const department = String(teacher.department || teacher.dept || "").trim();
  const assignments = Array.isArray(teacher.assignments)
    ? (teacher.assignments as TeacherDirectoryEntry["assignments"])
    : [];
  const asStrings = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((v) => String(v)).filter(Boolean) : [];

  return {
    uid,
    name: String(teacher.name || teacher.fullName || teacher.displayName || "")
      .trim(),
    photoURL: String(teacher.photoURL || "").trim(),
    email: String(teacher.email || teacher.contactEmail || "")
      .trim()
      .toLowerCase(),
    dept: department,
    department,
    teacherId: String(teacher.teacherId || teacher.employeeId || "").trim(),
    assignments,
    assignedSubjects: asStrings(teacher.assignedSubjects),
    assignedBranches: asStrings(teacher.assignedBranches),
    assignedYears: asStrings(teacher.assignedYears),
    updatedAt: new Date().toISOString(),
  };
};

type MinimalFirestore = {
  collection: (name: string) => {
    doc: (id: string) => {
      set: (data: unknown, options?: { merge: boolean }) => Promise<unknown>;
      delete: () => Promise<unknown>;
    };
  };
};

/** Publishes (or refreshes) a teacher's directory entry. */
export const writeTeacherDirectory = async (
  firestore: MinimalFirestore | adminFirestore.Firestore,
  uid: string,
  teacher: Record<string, unknown>,
): Promise<void> => {
  const entry = buildTeacherDirectoryEntry(uid, teacher);
  await (firestore as MinimalFirestore)
    .collection(TEACHER_DIRECTORY)
    .doc(uid)
    .set(entry, { merge: false });
};

/** Removes a directory entry, so a deleted teacher stops being listed. */
export const deleteTeacherDirectory = async (
  firestore: MinimalFirestore | adminFirestore.Firestore,
  uid: string,
): Promise<void> => {
  await (firestore as MinimalFirestore)
    .collection(TEACHER_DIRECTORY)
    .doc(uid)
    .delete();
};
