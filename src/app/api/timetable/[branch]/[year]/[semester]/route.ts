import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAuthenticatedUser } from "@/lib/server/auth-guards";
import {
  normalizeBranch,
  normalizeSemester,
  normalizeYear,
} from "@/lib/server/constants";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ branch: string; year: string; semester: string }> },
) {
  const g = await requireAuthenticatedUser(req);
  if (g.ok === false) return g.response;

  try {
    const {
      branch: branchParam,
      year: yearParam,
      semester: semesterParam,
    } = await params;
    const branch = normalizeBranch(branchParam || "");
    const year = normalizeYear(yearParam || "");
    const semester = normalizeSemester(semesterParam || "");

    if (!branch || !year || !semester) {
      return NextResponse.json(
        { message: "Valid branch, year and semester are required." },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();
    const snapshot = await firestore
      .collection("timetables")
      .where("branch", "==", branch)
      .where("year", "==", year)
      .where("semester", "==", semester)
      .get();

    const lectures = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Record<string, any>),
      }))
      .sort((a: Record<string, any>, b: Record<string, any>) => {
        const dayOrder = [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ];
        const dayDiff =
          dayOrder.indexOf(a.day || "") - dayOrder.indexOf(b.day || "");
        if (dayDiff !== 0) return dayDiff;
        return String(a.startTime || "").localeCompare(
          String(b.startTime || ""),
        );
      });

    return NextResponse.json({ success: true, lectures }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}
