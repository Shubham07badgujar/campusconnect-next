import { NextRequest, NextResponse } from "next/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";
import { getSubjectSetsMap } from "@/lib/server/subject-sets";
import {
  makeSubjectSetDocId,
  normalizeBranch,
  normalizeSemester,
  normalizeYear,
} from "@/lib/server/constants";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const subjectSets = await getSubjectSetsMap();
    return NextResponse.json({ success: true, subjectSets });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json();
    const { branch, year, semester, subjects } = body;
    const normalizedBranch = normalizeBranch(branch);
    const normalizedYear = normalizeYear(year);
    const normalizedSemester = normalizeSemester(semester);
    const cleanedSubjects = Array.isArray(subjects)
      ? subjects.map((s: unknown) => String(s).trim()).filter(Boolean)
      : [];

    if (
      !normalizedBranch ||
      !normalizedYear ||
      !normalizedSemester ||
      cleanedSubjects.length === 0
    ) {
      return NextResponse.json(
        { message: "Branch, year, semester and at least one subject are required" },
        { status: 400 },
      );
    }

    const docId = makeSubjectSetDocId(
      normalizedBranch,
      normalizedYear,
      normalizedSemester,
    );
    await adminApp.firestore().collection("subjectSets").doc(docId).set(
      {
        branch: normalizedBranch,
        year: normalizedYear,
        semester: normalizedSemester,
        subjects: cleanedSubjects,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const subjectSets = await getSubjectSetsMap();
    return NextResponse.json({
      success: true,
      message: "Subject set updated successfully",
      subjectSets,
    });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
