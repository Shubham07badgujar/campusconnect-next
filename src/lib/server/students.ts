// Single source of truth for the shape of a student profile document.
//
// WHY THIS EXISTS: a student record is written by two paths — bulk onboarding
// (src/app/api/admin/bulk-onboard-students/route.ts) and single creation
// (src/app/api/users/route.ts). They had drifted, and the single-creation path
// omitted `prn` and `subjects` and never wrote the `students` document at all.
// That is not cosmetic:
//
//   * Attendance enrolment is decided by studentBelongsToSession()
//     (src/lib/server/attendance/shared.ts), which requires a non-empty
//     `subjects` array intersecting the session's subject. An empty array means
//     `.some()` is false, so such a student can never be marked present.
//   * Password reset by roll number queries the `students` collection
//     (src/lib/server/otp.ts), so a missing document breaks that too.
//
// Both paths now build the payload here, so they cannot drift again.
import {
  normalizeBranch,
  normalizePhone,
  normalizeSemester,
  normalizeYear,
} from "@/lib/server/constants";

export type SubjectSetsMap = Record<
  string,
  Record<string, Record<string, string[]>>
>;

export type StudentProfileInput = {
  uid: string;
  name: unknown;
  /** The login/auth email for the account. */
  email: unknown;
  /** Roll number / PRN — the institution-local student identifier. */
  rollNo: unknown;
  dept: unknown;
  year: unknown;
  semester: unknown;
  phone?: unknown;
  contactEmail?: unknown;
  /** Recorded on the document so the origin of a record stays traceable. */
  onboardingSource: string;
};

export type StudentProfile = {
  uid: string;
  name: string;
  email: string;
  loginId: string;
  prn: string;
  rollNo: string;
  rollNumber: string;
  phone: string;
  mobile: string;
  dept: string;
  department: string;
  year: string;
  semester: string;
  subjects: string[];
  role: "Student";
  contactEmail: string;
  onboardingSource: string;
};

export type BuildStudentProfileResult =
  | { ok: true; profile: StudentProfile }
  | { ok: false; errors: string[] };

/**
 * Resolves the subjects a student is enrolled in for their branch/year/semester.
 * Matches the bulk-onboarding lookup exactly — semester-specific, not the
 * union of both semesters.
 */
export const resolveStudentSubjects = (
  subjectSets: SubjectSetsMap,
  branch: string,
  year: string,
  semester: string,
): string[] => {
  const subjects = subjectSets?.[branch]?.[year]?.[semester];
  return Array.isArray(subjects) ? subjects.filter(Boolean) : [];
};

/**
 * Validates and normalizes one student record.
 *
 * Returns errors rather than a half-built profile: creating a student with no
 * subjects "succeeds" from the admin's point of view and then silently excludes
 * them from every attendance session, which is precisely the failure this
 * module exists to prevent. Failing loudly, with an actionable message, is the
 * intended behaviour and matches bulk onboarding.
 */
export const buildStudentProfile = (
  input: StudentProfileInput,
  subjectSets: SubjectSetsMap,
): BuildStudentProfileResult => {
  const errors: string[] = [];

  const name = String(input.name || "").trim();
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  const prn = String(input.rollNo || "")
    .trim()
    .toUpperCase();
  const branch = normalizeBranch(input.dept);
  const year = normalizeYear(input.year);
  const semester = normalizeSemester(input.semester);
  const phone = normalizePhone(input.phone ?? "");
  const contactEmail = String(input.contactEmail || "")
    .trim()
    .toLowerCase();

  if (!name) errors.push("Name is required");
  if (!email) errors.push("Email is required");
  if (!prn) errors.push("Roll number is required");
  if (!branch) errors.push("Missing or unrecognised department");
  if (!year) errors.push("Missing or invalid year");
  if (!semester) errors.push("Missing or invalid semester");

  const subjects = resolveStudentSubjects(subjectSets, branch, year, semester);
  if (branch && year && semester && subjects.length === 0) {
    errors.push(
      `No subject set is configured for ${branch} / ${year} Year / Semester ${semester}. ` +
        "Configure it under Subject Sets first, otherwise this student cannot be " +
        "enrolled in attendance sessions.",
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    profile: {
      uid: input.uid,
      name,
      email,
      // Aliases are written together because different parts of the app read
      // different ones; see the audit's note on duplicated identity fields.
      loginId: prn,
      prn,
      rollNo: prn,
      rollNumber: prn,
      phone,
      mobile: phone,
      dept: branch,
      department: branch,
      year,
      semester,
      subjects,
      role: "Student",
      contactEmail,
      onboardingSource: input.onboardingSource,
    },
  };
};

/**
 * Writes a student to BOTH `users/{uid}` and `students/{uid}`.
 *
 * Both documents are required: `users` is what the admin screens and the
 * attendance roster read, `students` is what password reset by roll number
 * queries. Writing only one leaves a student who looks fine in the admin list
 * but cannot be marked present or recover their password.
 */
export const writeStudentProfile = async (
  firestore: {
    collection: (name: string) => {
      doc: (id: string) => {
        set: (data: unknown, options?: { merge: boolean }) => Promise<unknown>;
      };
    };
  },
  profile: StudentProfile,
  createdAt: string = new Date().toISOString(),
): Promise<void> => {
  const payload = { ...profile, createdAt };
  await firestore.collection("users").doc(profile.uid).set(payload);
  await firestore
    .collection("students")
    .doc(profile.uid)
    .set(payload, { merge: true });
};
