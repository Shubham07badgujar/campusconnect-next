import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import {
  BRANCHES,
  YEAR_KEYS,
  SEMESTER_KEYS,
  DEFAULT_SUBJECT_SETS,
  makeSubjectSetDocId,
  normalizeSemester,
} from "@/lib/server/constants";

export type SubjectSetsMap = Record<string, Record<string, Record<string, string[]>>>;

export const ensureSubjectSetsInitialized = async (): Promise<void> => {
  const firestore = adminApp.firestore();
  const snapshot = await firestore.collection("subjectSets").get();
  const existingIds = new Set(snapshot.docs.map((docSnap) => docSnap.id));

  const batch = firestore.batch();
  let hasWrites = false;
  BRANCHES.forEach((branch) => {
    YEAR_KEYS.forEach((year) => {
      SEMESTER_KEYS.forEach((semester) => {
        const docId = makeSubjectSetDocId(branch, year, semester);
        if (existingIds.has(docId)) return;

        const docRef = firestore.collection("subjectSets").doc(docId);
        batch.set(docRef, {
          branch,
          year,
          semester,
          subjects:
            (DEFAULT_SUBJECT_SETS as SubjectSetsMap)?.[branch]?.[year]?.[semester] || [],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        hasWrites = true;
      });
    });
  });

  if (!hasWrites) {
    return;
  }

  await batch.commit();
};

export const getSubjectSetsMap = async (): Promise<SubjectSetsMap> => {
  await ensureSubjectSetsInitialized();

  const subjectSetsMap: SubjectSetsMap = {};
  const firestore = adminApp.firestore();
  const snapshot = await firestore.collection("subjectSets").get();

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() as {
      branch: string;
      year: string;
      semester: string;
      subjects?: string[];
    };
    if (!subjectSetsMap[data.branch]) {
      subjectSetsMap[data.branch] = {};
    }
    if (!subjectSetsMap[data.branch][data.year]) {
      subjectSetsMap[data.branch][data.year] = {};
    }

    const semester = normalizeSemester(data.semester) || "1";
    subjectSetsMap[data.branch][data.year][semester] = data.subjects || [];
  });

  return subjectSetsMap;
};

export const getAllowedSubjectsForBranchYear = (
  subjectSetsMap: SubjectSetsMap,
  branch: string,
  year: string,
): string[] => {
  const semesterWiseSubjects = subjectSetsMap?.[branch]?.[year] || {};
  const sem1 = Array.isArray(semesterWiseSubjects["1"]) ? semesterWiseSubjects["1"] : [];
  const sem2 = Array.isArray(semesterWiseSubjects["2"]) ? semesterWiseSubjects["2"] : [];
  return [...new Set([...sem1, ...sem2].map((s) => String(s).trim()))].filter(Boolean);
};
