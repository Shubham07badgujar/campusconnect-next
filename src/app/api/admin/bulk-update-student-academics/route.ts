import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";
import {
  normalizeBranch,
  normalizeSemester,
  normalizeYear,
} from "@/lib/server/constants";
import { getSubjectSetsMap } from "@/lib/server/subject-sets";
import { buildExistingStudentIndex } from "@/lib/server/onboarding";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { updates } = body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { message: "No update rows provided" },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();
    const subjectSets: any = await getSubjectSetsMap();
    const existingByPrn = await buildExistingStudentIndex(firestore);

    const updatedEntries: any[] = [];
    const notFoundEntries: any[] = [];
    const failedEntries: any[] = [];

    for (const rawUpdate of updates) {
      const prn = String(rawUpdate.prn || "")
        .trim()
        .toUpperCase();
      const inputYear = normalizeYear(rawUpdate.year || "");
      const inputSemester = normalizeSemester(rawUpdate.semester || "");

      if (!prn) {
        failedEntries.push({
          prn: "",
          reason: "Missing PRN",
        });
        continue;
      }

      if (!existingByPrn.has(prn)) {
        notFoundEntries.push({ prn, reason: "Student not found" });
        continue;
      }

      try {
        const existing = existingByPrn.get(prn);
        const targetUid =
          existing.uid || existing.userDocId || existing.studentDocId || "";

        let currentUserData: any = {};
        let currentStudentData: any = {};

        if (existing.userDocId || targetUid) {
          const userDoc = await firestore
            .collection("users")
            .doc(existing.userDocId || targetUid)
            .get();
          currentUserData = userDoc.exists ? userDoc.data() : {};
        }

        if (existing.studentDocId || targetUid) {
          const studentDoc = await firestore
            .collection("students")
            .doc(existing.studentDocId || targetUid)
            .get();
          currentStudentData = studentDoc.exists ? studentDoc.data() : {};
        }

        const mergedData = { ...currentStudentData, ...currentUserData };
        const branch = normalizeBranch(
          mergedData.dept || mergedData.department || rawUpdate.branch || "",
        );
        const year = inputYear || normalizeYear(mergedData.year || "");
        const semester =
          inputSemester || normalizeSemester(mergedData.semester || "");

        if (!branch || !year || !semester) {
          failedEntries.push({
            prn,
            reason: "Missing branch/year/semester to update",
          });
          continue;
        }

        const subjects = subjectSets?.[branch]?.[year]?.[semester] || [];
        if (subjects.length === 0) {
          failedEntries.push({
            prn,
            reason: "No subject set configured for branch/year/semester",
          });
          continue;
        }

        const academicUpdatePayload = {
          year,
          semester,
          dept: branch,
          department: branch,
          subjects,
          updatedAt: new Date().toISOString(),
          onboardingSource: "bulk_academic_update",
        };

        if (existing.userDocId || targetUid) {
          await firestore
            .collection("users")
            .doc(existing.userDocId || targetUid)
            .set(academicUpdatePayload, { merge: true });
        }

        if (existing.studentDocId || targetUid) {
          await firestore
            .collection("students")
            .doc(existing.studentDocId || targetUid)
            .set(academicUpdatePayload, { merge: true });
        }

        updatedEntries.push({
          prn,
          year,
          semester,
          branch,
          subjectCount: subjects.length,
        });
      } catch (rowError: any) {
        failedEntries.push({
          prn,
          reason: rowError.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalRows: updates.length,
        updatedCount: updatedEntries.length,
        notFoundCount: notFoundEntries.length,
        failedCount: failedEntries.length,
        updatedEntries,
        notFoundEntries,
        failedEntries,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
