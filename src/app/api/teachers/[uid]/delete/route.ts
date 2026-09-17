import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";

export const runtime = "nodejs";

/**
 * Delete a teacher completely.
 *
 * Deletion used to happen in the browser as a single deleteDoc() on
 * `teachers/{uid}`, which left two things behind:
 *
 *   1. The Firebase Auth account, still carrying its `teacher: true` custom
 *      claim — so a "deleted" teacher could still sign in and still passed
 *      requireTeacher(), because that guard accepts the claim.
 *   2. Their teacherStudentMappings rows, which nothing then cleaned up.
 *
 * The orphaned login was also what made teacher-ID reuse dangerous: the next
 * hire could be handed the deleted teacher's ID and, with it, their account.
 * IDs are now allocated from a monotonic counter so they are never reissued,
 * and this route removes the account rather than leaving it stranded.
 *
 * Order matters. The claim is revoked and sessions are invalidated FIRST, so
 * that a failure part-way through leaves the teacher locked out rather than
 * still holding access.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  const { uid } = await params;
  if (!uid) {
    return NextResponse.json(
      { message: "Teacher UID is required." },
      { status: 400 },
    );
  }

  const firestore = adminApp.firestore();
  const warnings: string[] = [];

  try {
    // 1. Revoke access first.
    try {
      await adminApp.auth().setCustomUserClaims(uid, {});
      await adminApp.auth().revokeRefreshTokens(uid);
    } catch (error) {
      const code = (error as { code?: string }).code || "";
      if (code !== "auth/user-not-found") throw error;
      warnings.push("No authentication account was found for this teacher.");
    }

    // 2. Remove the derived mappings so no dangling rows reference them.
    const mappings = await firestore
      .collection("teacherStudentMappings")
      .where("teacherUid", "==", uid)
      .get();

    let batch = firestore.batch();
    let ops = 0;
    for (const docSnap of mappings.docs) {
      batch.delete(docSnap.ref);
      ops += 1;
      // Firestore caps a batch at 500 operations.
      if (ops >= 400) {
        await batch.commit();
        batch = firestore.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();

    // 3. The profile.
    await firestore.collection("teachers").doc(uid).delete();

    // 4. Finally the account itself.
    try {
      await adminApp.auth().deleteUser(uid);
    } catch (error) {
      const code = (error as { code?: string }).code || "";
      if (code !== "auth/user-not-found") throw error;
    }

    return NextResponse.json(
      {
        message: "Teacher deleted.",
        removedMappings: mappings.size,
        warnings,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to delete teacher:", error);
    return NextResponse.json(
      { message: "Failed to delete teacher." },
      { status: 500 },
    );
  }
}
