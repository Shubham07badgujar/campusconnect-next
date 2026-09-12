import { NextRequest, NextResponse } from "next/server";
import { getSubjectSetsMap } from "@/lib/server/subject-sets";
import { normalizeSemester } from "@/lib/server/constants";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const department = searchParams.get("department");
  const year = searchParams.get("year");
  const semester = searchParams.get("semester");

  if (!department || !year) {
    return NextResponse.json(
      { message: "Department and year are required." },
      { status: 400 },
    );
  }

  try {
    const subjectSetsMap = await getSubjectSetsMap();
    const normalizedSemester = normalizeSemester(semester || "");
    const subjectsForYear = subjectSetsMap[department]?.[year] || {};
    const subjects = normalizedSemester
      ? subjectsForYear?.[normalizedSemester] || []
      : [...(subjectsForYear?.["1"] || []), ...(subjectsForYear?.["2"] || [])];
    return NextResponse.json({ subjects });
  } catch (error) {
    return NextResponse.json(
      { message: "Failed to fetch subjects.", error: (error as Error).message },
      { status: 500 },
    );
  }
}
