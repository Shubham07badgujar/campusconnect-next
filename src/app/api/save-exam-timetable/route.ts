import { NextRequest, NextResponse } from "next/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";

export const runtime = "nodejs";

// Save parsed exam timetable data (with duplicate prevention)
export async function POST(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { exams, year, replaceExisting = false } = body;

    if (!exams || !Array.isArray(exams) || exams.length === 0) {
      return NextResponse.json(
        { message: "No exam data provided" },
        { status: 400 },
      );
    }

    if (!year) {
      return NextResponse.json({ message: "Year is required" }, { status: 400 });
    }

    const firestore = adminApp.firestore();

    if (replaceExisting) {
      const sameYearSnapshot = await firestore
        .collection("examTimetable")
        .where("year", "==", year)
        .get();

      if (!sameYearSnapshot.empty) {
        const deactivateBatch = firestore.batch();
        sameYearSnapshot.docs.forEach((docSnap) => {
          deactivateBatch.set(
            docSnap.ref,
            {
              isActive: false,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        });
        await deactivateBatch.commit();
      }
    }

    // Fetch existing exams to check for duplicates
    const existingSnapshot = await firestore.collection("examTimetable").get();
    const existingExams = existingSnapshot.docs
      .map((docSnap) => docSnap.data() || {})
      .filter((entry: any) => entry.isActive !== false);

    // Create a Set of existing exam keys for fast lookup
    const existingKeys = new Set(
      existingExams.map(
        (e: any) =>
          `${String(e.date || "").trim()}|${String(e.courseCode || "")
            .trim()
            .toUpperCase()}|${String(e.year || "").trim()}|${String(e.branch || "").trim()}`,
      ),
    );

    // Filter out duplicates
    const newExams = exams.filter((exam: any) => {
      const examYear = exam.year || year;
      const examBranch = exam.branch || "";
      const key = `${String(exam.date || "").trim()}|${String(
        exam.courseCode || "",
      )
        .trim()
        .toUpperCase()}|${String(examYear || "").trim()}|${String(examBranch || "").trim()}`;
      return !existingKeys.has(key);
    });

    if (newExams.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All exams already exist. No new entries added.",
        savedCount: 0,
        skippedCount: exams.length,
      });
    }

    const batch = firestore.batch();

    newExams.forEach((exam: any) => {
      const docRef = firestore.collection("examTimetable").doc();
      batch.set(docRef, {
        ...exam,
        year: exam.year || year,
        branch: exam.branch || "",
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    const skippedCount = exams.length - newExams.length;
    return NextResponse.json({
      success: true,
      message: `Saved ${newExams.length} exam entries${
        skippedCount > 0 ? ` (${skippedCount} duplicates skipped)` : ""
      }`,
      savedCount: newExams.length,
      skippedCount: skippedCount,
    });
  } catch (error: any) {
    console.error("Save exam timetable error:", error);
    return NextResponse.json(
      {
        message: "Failed to save exam timetable",
        error: error.message,
      },
      { status: 500 },
    );
  }
}
