// Shared attendance helpers — ported verbatim from the legacy monolith.
import type { firestore as adminFirestore } from "firebase-admin";
import {
  ATTENDANCE_SETTINGS_COLLECTION,
  ATTENDANCE_SETTINGS_DOC_ID,
  ENFORCE_ATTENDANCE_DISTANCE_CHECK,
  normalizeBranch,
  normalizeSemester,
  normalizeYear,
} from "@/lib/server/constants";

type AnyRecord = Record<string, any>;

export const makeSubjectId = (subjectName: unknown = ""): string => {
  return String(subjectName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

export const parseTimeToMinutes = (timeValue: unknown = ""): number => {
  const normalized = String(timeValue || "").trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.NaN;

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return Number.NaN;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return Number.NaN;

  return hour * 60 + minute;
};

export const getAttendanceSettings = async (
  firestore: adminFirestore.Firestore,
) => {
  const settingsDoc = await firestore
    .collection(ATTENDANCE_SETTINGS_COLLECTION)
    .doc(ATTENDANCE_SETTINGS_DOC_ID)
    .get();

  const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};
  return {
    distanceEnforcementDefault:
      typeof (settings as AnyRecord).distanceEnforcementDefault === "boolean"
        ? (settings as AnyRecord).distanceEnforcementDefault
        : ENFORCE_ATTENDANCE_DISTANCE_CHECK,
    updatedAt: (settings as AnyRecord).updatedAt || null,
    updatedBy: String((settings as AnyRecord).updatedBy || "").trim(),
  };
};

export const shouldEnforceDistanceForSession = (
  sessionData: AnyRecord = {},
): boolean => {
  if (typeof sessionData.enforceDistanceCheck === "boolean") {
    return sessionData.enforceDistanceCheck;
  }
  return ENFORCE_ATTENDANCE_DISTANCE_CHECK;
};

export const normalizeSubjectValues = (subjects: unknown = []): string[] => {
  return (Array.isArray(subjects) ? subjects : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
};

export const subjectMatches = (
  subjectName: unknown,
  subjectId: unknown,
  candidate: unknown,
): boolean => {
  const normalizedCandidate = String(candidate || "").trim();
  if (!normalizedCandidate) return false;

  return (
    normalizedCandidate.toLowerCase() === String(subjectName || "").toLowerCase() ||
    makeSubjectId(normalizedCandidate) === String(subjectId || "")
  );
};

export const studentBelongsToSession = (
  studentData: AnyRecord,
  sessionData: AnyRecord,
): boolean => {
  const studentBranch = normalizeBranch(
    studentData?.dept || studentData?.department || "",
  );
  const studentYear = normalizeYear(studentData?.year || "");
  const studentSemester = normalizeSemester(studentData?.semester || "");
  const studentSubjects = normalizeSubjectValues(studentData?.subjects);

  if (!studentBranch || !studentYear) {
    return false;
  }

  const branchOk = studentBranch === normalizeBranch(sessionData?.branch || "");
  const yearOk = studentYear === normalizeYear(sessionData?.year || "");
  const semesterValue = normalizeSemester(sessionData?.semester || "");
  const semesterOk =
    !semesterValue || !studentSemester || studentSemester === semesterValue;

  if (!branchOk || !yearOk || !semesterOk) {
    return false;
  }

  return studentSubjects.some((subject) =>
    subjectMatches(sessionData?.subjectName || "", sessionData?.subjectId || "", subject),
  );
};

export const getSessionEnrolledStudents = async (
  firestore: adminFirestore.Firestore,
  sessionData: AnyRecord,
): Promise<AnyRecord[]> => {
  const branch = normalizeBranch(sessionData?.branch || "");
  const year = normalizeYear(sessionData?.year || "");
  const semester = normalizeSemester(sessionData?.semester || "");
  const merged = new Map<string, AnyRecord>();

  const absorbDoc = (docSnap: adminFirestore.QueryDocumentSnapshot) => {
    const data = docSnap.data() || {};
    const uid = (data as AnyRecord).uid || docSnap.id;
    if (!uid) return;

    const existing = merged.get(uid) || { uid };
    merged.set(uid, {
      ...existing,
      ...data,
      uid,
    });
  };

  const fetchClassScopedCandidates = async () => {
    if (!branch || !year) {
      return [];
    }

    const queryConfig: Array<{
      collection: string;
      branchField: string;
      role?: string;
    }> = [
      { collection: "students", branchField: "dept" },
      { collection: "students", branchField: "department" },
      { collection: "users", branchField: "dept", role: "Student" },
      { collection: "users", branchField: "department", role: "Student" },
    ];

    const tasks = queryConfig.map(async ({ collection, branchField, role }) => {
      try {
        let queryRef: adminFirestore.Query = firestore
          .collection(collection)
          .where(branchField, "==", branch)
          .where("year", "==", year);

        if (role) {
          queryRef = queryRef.where("role", "==", role);
        }

        if (semester) {
          queryRef = queryRef.where("semester", "==", semester);
        }

        return await queryRef.get();
      } catch {
        return null;
      }
    });

    const snapshots = await Promise.all(tasks);
    return snapshots.filter(Boolean) as adminFirestore.QuerySnapshot[];
  };

  const classScopedSnapshots = await fetchClassScopedCandidates();
  if (classScopedSnapshots.length > 0) {
    classScopedSnapshots.forEach((snapshot) => {
      snapshot.docs.forEach(absorbDoc);
    });
  }

  if (merged.size === 0) {
    const [usersSnapshot, studentsSnapshot] = await Promise.all([
      firestore.collection("users").where("role", "==", "Student").get(),
      firestore.collection("students").get(),
    ]);

    usersSnapshot.docs.forEach(absorbDoc);
    studentsSnapshot.docs.forEach(absorbDoc);
  }

  return Array.from(merged.values()).filter((student) =>
    studentBelongsToSession(student, sessionData),
  );
};

export const getSessionStudentIds = (sessionData: AnyRecord = {}): string[] => {
  const ids = [
    ...(Array.isArray(sessionData.enrolledStudentIds)
      ? sessionData.enrolledStudentIds
      : []),
    ...(Array.isArray(sessionData.presentStudentIds)
      ? sessionData.presentStudentIds
      : []),
    ...(Array.isArray(sessionData.absentStudentIds)
      ? sessionData.absentStudentIds
      : []),
    ...(Array.isArray(sessionData.presentStudents)
      ? sessionData.presentStudents.map((student: AnyRecord) => student.studentId)
      : []),
    ...(Array.isArray(sessionData.absentStudents)
      ? sessionData.absentStudents.map((student: AnyRecord) => student.studentId)
      : []),
  ];

  return Array.from(
    new Set(ids.map((studentId) => String(studentId || "").trim()).filter(Boolean)),
  );
};

export const findStudentByStudentIdOrPrn = async (
  firestore: adminFirestore.Firestore,
  { studentId, prn }: { studentId?: string; prn?: string },
): Promise<AnyRecord | null> => {
  const { getStudentProfileByUid, normalizePrn, getPrnFromRecord } = await import(
    "@/lib/server/utils"
  );
  const normalizedStudentId = String(studentId || "").trim();
  const normalizedPrnInput = normalizePrn(prn || "");

  if (normalizedStudentId) {
    const byId = await getStudentProfileByUid(firestore, normalizedStudentId);
    if (byId) {
      return byId;
    }
  }

  const prnCandidates: string[] = [];
  if (normalizedPrnInput) {
    prnCandidates.push(normalizedPrnInput);
  }

  if (normalizedStudentId) {
    const maybePrn = normalizePrn(normalizedStudentId);
    if (maybePrn && !prnCandidates.includes(maybePrn)) {
      prnCandidates.push(maybePrn);
    }
  }

  for (const candidatePrn of prnCandidates) {
    for (const collectionName of ["users", "students"]) {
      for (const field of ["prn", "rollNo", "rollNumber"]) {
        try {
          const snapshot = await firestore
            .collection(collectionName)
            .where(field, "==", candidatePrn)
            .limit(1)
            .get();

          if (!snapshot.empty) {
            const docSnap = snapshot.docs[0];
            const data = docSnap.data() || {};
            const uid = (data as AnyRecord).uid || docSnap.id;
            const profile = await getStudentProfileByUid(firestore, uid);
            if (profile && getPrnFromRecord(profile)) {
              return profile;
            }
            return { uid, ...data };
          }
        } catch {
          // try next field/collection
        }
      }
    }
  }

  return null;
};
