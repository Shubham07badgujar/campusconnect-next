// Teacher/user helpers ported verbatim from the legacy Express monolith.
import type { firestore as adminFirestore } from "firebase-admin";
import { FieldValue } from "@/lib/server/firebase-admin";
import {
  JOB_PROFILE_CONFIG,
  normalizeBranch,
  normalizeYear,
  normalizeJobProfile,
} from "@/lib/server/constants";
import { getAllowedSubjectsForBranchYear } from "@/lib/server/subject-sets";
import { normalizeEmail } from "@/lib/server/utils";
import { normalizeTeacherLoginId } from "@/lib/server/passwords";

export const buildAssignmentsFromLegacyCourses = (
  department: unknown,
  assignedCourses: any[] = [],
) => {
  const normalizedBranch = normalizeBranch((department as string) || "");
  if (!normalizedBranch || !Array.isArray(assignedCourses)) {
    return [];
  }

  return assignedCourses
    .map((course) => {
      const normalizedYear = normalizeYear(course?.year || "");
      const subjects = Array.isArray(course?.subjects)
        ? [...new Set(course.subjects.map((s: unknown) => String(s).trim()))].filter(
            Boolean,
          )
        : [];

      if (!normalizedYear || subjects.length === 0) {
        return null;
      }

      return {
        branch: normalizedBranch,
        year: normalizedYear,
        subjects,
      };
    })
    .filter(Boolean) as { branch: string; year: string; subjects: string[] }[];
};

export const normalizeTeacherAssignments = ({
  assignments,
  subjectSetsMap,
  fallbackBranch,
  legacyAssignedCourses,
}: {
  assignments?: any;
  subjectSetsMap: any;
  fallbackBranch?: string;
  legacyAssignedCourses?: any;
}) => {
  const rawAssignments = Array.isArray(assignments)
    ? assignments
    : buildAssignmentsFromLegacyCourses(fallbackBranch, legacyAssignedCourses);

  if (!Array.isArray(rawAssignments) || rawAssignments.length === 0) {
    throw new Error("At least one branch/year/subject assignment is required.");
  }

  const seenBranchYear = new Set<string>();
  const normalizedAssignments = rawAssignments.map((item: any) => {
    const branch = normalizeBranch(
      item?.branch || item?.dept || fallbackBranch,
    );
    const year = normalizeYear(item?.year || "");
    const subjects = Array.isArray(item?.subjects)
      ? [...new Set(item.subjects.map((s: unknown) => String(s).trim()))].filter(Boolean)
      : [];

    if (!branch || !year || subjects.length === 0) {
      throw new Error(
        "Each assignment must include a valid branch, year and at least one subject.",
      );
    }

    const branchYearKey = `${branch}__${year}`;
    if (seenBranchYear.has(branchYearKey)) {
      throw new Error(`Duplicate assignment found for ${branch} ${year} year.`);
    }
    seenBranchYear.add(branchYearKey);

    const allowedSubjects = getAllowedSubjectsForBranchYear(
      subjectSetsMap,
      branch,
      year,
    );
    if (allowedSubjects.length === 0) {
      throw new Error(
        `No subject set configured for ${branch} ${year} year. Please configure it first.`,
      );
    }

    const invalidSubjects = subjects.filter(
      (subject: string) => !allowedSubjects.includes(subject),
    );
    if (invalidSubjects.length > 0) {
      throw new Error(
        `Invalid subjects for ${branch} ${year} year: ${invalidSubjects.join(", ")}`,
      );
    }

    return {
      branch,
      year,
      subjects,
    };
  });

  return normalizedAssignments as { branch: string; year: string; subjects: string[] }[];
};

export const buildLegacyAssignedCourses = (
  assignments: { branch: string; year: string; subjects: string[] }[] = [],
) => {
  const byYear: Record<string, Set<string>> = {};

  assignments.forEach((assignment) => {
    if (!byYear[assignment.year]) {
      byYear[assignment.year] = new Set();
    }

    assignment.subjects.forEach((subject) => {
      byYear[assignment.year].add(subject);
    });
  });

  return Object.entries(byYear).map(([year, subjectsSet]) => ({
    year,
    subjects: Array.from(subjectsSet),
  }));
};

export const getAssignmentSummaryFields = (
  assignments: { branch: string; year: string; subjects: string[] }[] = [],
) => {
  const assignedBranches = [
    ...new Set(assignments.map((assignment) => assignment.branch)),
  ];
  const assignedYears = [
    ...new Set(assignments.map((assignment) => assignment.year)),
  ];
  const assignedSubjects = [
    ...new Set(assignments.flatMap((assignment) => assignment.subjects || [])),
  ];

  return {
    assignedBranches,
    assignedYears,
    assignedSubjects,
  };
};

// generateTeacherId() used to live here: a full-collection scan for the highest
// sequence, plus one, with no transaction. Two concurrent creations derived the
// same id, and deleting a teacher let the scan-derived maximum fall back so the
// id was reissued. Both routes ended in an account takeover.
//
// It has been replaced by the transactional, monotonic allocator in
// src/lib/server/teacher-ids.ts (allocateFreeTeacherId). It is deleted rather
// than deprecated so the unsafe version cannot be picked up again by mistake.

export const syncTeacherStudentMappings = async ({
  firestore,
  teacherUid,
  teacherId,
  teacherName,
  assignments,
}: {
  firestore: adminFirestore.Firestore;
  teacherUid: string;
  teacherId: string;
  teacherName: string;
  assignments: { branch: string; year: string; subjects: string[] }[];
}) => {
  const existingMappingsSnapshot = await firestore
    .collection("teacherStudentMappings")
    .where("teacherUid", "==", teacherUid)
    .get();

  const deleteOps: { type: "delete"; ref: adminFirestore.DocumentReference }[] = [];
  existingMappingsSnapshot.docs.forEach((docSnap) => {
    deleteOps.push({ type: "delete", ref: docSnap.ref });
  });

  const [studentsSnapshot, usersSnapshot] = await Promise.all([
    firestore.collection("students").get(),
    firestore.collection("users").where("role", "==", "Student").get(),
  ]);
  const studentRecords = new Map<string, Record<string, any>>();

  const absorbStudentRecord = (docSnap: adminFirestore.QueryDocumentSnapshot) => {
    const data = (docSnap.data() || {}) as Record<string, any>;
    const uid = data.uid || docSnap.id;
    if (!uid) return;

    const current = studentRecords.get(uid) || {};
    studentRecords.set(uid, {
      ...current,
      ...data,
      uid,
    });
  };

  studentsSnapshot.docs.forEach(absorbStudentRecord);
  usersSnapshot.docs.forEach(absorbStudentRecord);
  const createOps: {
    type: "set";
    ref: adminFirestore.DocumentReference;
    payload: Record<string, unknown>;
  }[] = [];

  Array.from(studentRecords.values()).forEach((studentData) => {
    const studentBranch = normalizeBranch(
      studentData.dept || studentData.department || "",
    );
    const studentYear = normalizeYear(studentData.year || "");
    const studentSubjects = Array.isArray(studentData.subjects)
      ? studentData.subjects
          .map((subject: unknown) => String(subject).trim())
          .filter(Boolean)
      : [];

    if (!studentBranch || !studentYear || studentSubjects.length === 0) {
      return;
    }

    assignments.forEach((assignment) => {
      if (
        assignment.branch !== studentBranch ||
        assignment.year !== studentYear
      ) {
        return;
      }

      const matchedSubjects = assignment.subjects.filter((subject) =>
        studentSubjects.includes(subject),
      );

      if (matchedSubjects.length === 0) {
        return;
      }

      const mappingDocId =
        `${teacherUid}_${studentData.uid}_${assignment.branch}_${assignment.year}`
          .replace(/[^a-zA-Z0-9_]/g, "_")
          .toLowerCase();

      createOps.push({
        type: "set",
        ref: firestore.collection("teacherStudentMappings").doc(mappingDocId),
        payload: {
          teacherUid,
          teacherId,
          teacherName,
          studentUid: studentData.uid,
          studentName: studentData.name || "",
          studentPrn:
            studentData.prn ||
            studentData.rollNo ||
            studentData.rollNumber ||
            "",
          branch: assignment.branch,
          year: assignment.year,
          subjects: matchedSubjects,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
    });
  });

  const allOps: (
    | { type: "delete"; ref: adminFirestore.DocumentReference }
    | {
        type: "set";
        ref: adminFirestore.DocumentReference;
        payload: Record<string, unknown>;
      }
  )[] = [...deleteOps, ...createOps];
  if (allOps.length === 0) {
    return;
  }

  let batch = firestore.batch();
  let opCount = 0;

  const commitBatch = async () => {
    if (opCount === 0) return;
    await batch.commit();
    batch = firestore.batch();
    opCount = 0;
  };

  for (const operation of allOps) {
    if (operation.type === "delete") {
      batch.delete(operation.ref);
    }
    if (operation.type === "set") {
      batch.set(operation.ref, operation.payload);
    }

    opCount += 1;
    if (opCount >= 400) {
      await commitBatch();
    }
  }

  await commitBatch();
};

export const findTeacherByLoginIdentifier = async (
  firestore: adminFirestore.Firestore,
  loginIdentifier: unknown = "",
) => {
  const normalizedInput = String(loginIdentifier || "")
    .trim()
    .toLowerCase();

  if (!normalizedInput) {
    return null;
  }

  const normalizedLoginId = normalizeTeacherLoginId(normalizedInput);
  let teacherSnapshot = await firestore
    .collection("teachers")
    .where("loginId", "==", normalizedLoginId)
    .limit(1)
    .get();

  if (teacherSnapshot.empty && normalizedInput.includes("@")) {
    teacherSnapshot = await firestore
      .collection("teachers")
      .where("authEmail", "==", normalizedInput)
      .limit(1)
      .get();
  }

  if (teacherSnapshot.empty) {
    const localTeacherId = normalizedInput.includes("@")
      ? normalizedInput.split("@")[0].toUpperCase()
      : normalizedInput.toUpperCase();

    teacherSnapshot = await firestore
      .collection("teachers")
      .where("teacherId", "==", localTeacherId)
      .limit(1)
      .get();
  }

  if (teacherSnapshot.empty) {
    return null;
  }

  const teacherDoc = teacherSnapshot.docs[0];
  const teacherData = (teacherDoc.data() || {}) as Record<string, any>;
  const authEmail =
    normalizeEmail(teacherData.authEmail) ||
    normalizeEmail(teacherData.loginId) ||
    normalizeTeacherLoginId(
      teacherData.teacherId || teacherData.employeeId || normalizedInput,
    );

  return {
    uid: teacherDoc.id,
    teacherData,
    authEmail,
    loginId: normalizeTeacherLoginId(
      teacherData.loginId ||
        teacherData.teacherId ||
        teacherData.employeeId ||
        normalizedInput,
    ),
  };
};
