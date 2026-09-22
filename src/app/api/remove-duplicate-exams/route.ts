import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";
import { reportError } from "@/lib/server/logger";

export const runtime = "nodejs";

// Remove duplicate exams from database
export async function DELETE(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const firestore = adminApp.firestore();
    const snapshot = await firestore.collection("examTimetable").get();

    // Group exams by unique key
    const examGroups: any = {};
    snapshot.docs.forEach((doc) => {
      const data: any = doc.data();
      if (data.isActive === false) {
        return;
      }
      const key = `${data.date}|${data.courseCode}|${data.year}|${data.branch}`;
      if (!examGroups[key]) {
        examGroups[key] = [];
      }
      examGroups[key].push(doc.id);
    });

    // Find duplicates (keep first, delete rest)
    const idsToDelete: any[] = [];
    Object.values(examGroups).forEach((ids: any) => {
      if (ids.length > 1) {
        // Keep the first one, delete the rest
        idsToDelete.push(...ids.slice(1));
      }
    });

    if (idsToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No duplicates found",
        deletedCount: 0,
      });
    }

    // Delete duplicates in batches of 500 (Firestore limit)
    const batchSize = 500;
    let deletedCount = 0;
    for (let i = 0; i < idsToDelete.length; i += batchSize) {
      const batch = firestore.batch();
      const batchIds = idsToDelete.slice(i, i + batchSize);
      batchIds.forEach((id) => {
        batch.delete(firestore.collection("examTimetable").doc(id));
      });
      await batch.commit();
      deletedCount += batchIds.length;
    }

    return NextResponse.json({
      success: true,
      message: `Removed ${deletedCount} duplicate exam entries`,
      deletedCount: deletedCount,
    });
  } catch (error: any) {
    reportError("Remove duplicates error", error, {
      route: "/api/remove-duplicate-exams",
    });
    return NextResponse.json(
      {
        message: "Failed to remove duplicates",
        error: error.message,
      },
      { status: 500 },
    );
  }
}
