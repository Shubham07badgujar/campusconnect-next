import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";

export const runtime = "nodejs";

// Clear all exam timetable data for a specific year/branch
export async function DELETE(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { year, branch, clearAll } = body;

    const firestore = adminApp.firestore();
    let query: any = firestore.collection("examTimetable");

    if (!clearAll) {
      if (year) query = query.where("year", "==", year);
      if (branch) query = query.where("branch", "==", branch);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      return NextResponse.json({
        message: "No exam timetable data to clear",
        deletedCount: 0,
      });
    }

    const batch = firestore.batch();
    snapshot.docs.forEach((doc: any) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Cleared ${snapshot.size} exam timetable entries`,
      deletedCount: snapshot.size,
    });
  } catch (error: any) {
    console.error("Clear exam timetable error:", error);
    return NextResponse.json(
      {
        message: "Failed to clear exam timetable",
        error: error.message,
      },
      { status: 500 },
    );
  }
}
