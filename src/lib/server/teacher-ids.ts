// Teacher ID allocation.
//
// WHAT WAS WRONG: generateTeacherId() read the entire `teachers` collection,
// took the highest sequence, added one, and returned it — with no transaction.
// Two concurrent creations therefore derived the SAME id, and the creation
// route then treated an existing Firebase Auth account at that login address as
// "the same teacher", resetting its password and renaming it. One teacher could
// silently take over another's account.
//
// The same collision was reachable without any concurrency: deleting a teacher
// removed only the Firestore document, so the scan-derived maximum dropped back
// and the next hire was handed a deleted colleague's id — and their account.
//
// This replaces the scan with a transactional, MONOTONIC counter per prefix:
//
//   * Monotonic — the counter never decreases, so a deleted teacher's id is
//     never reissued and the orphan-collision path disappears.
//   * Transactional — Firestore retries a conflicting transaction, so two
//     concurrent callers cannot receive the same number.
//   * Seeded from the existing maximum, so live ids keep their values and no
//     migration is needed.
//   * Format unchanged: padStart(2) is a MINIMUM width, so PM01..PM99 continue
//     as before and the sequence widens naturally to PM100, PM101, ...
import type { firestore as adminFirestore } from "firebase-admin";
import { JOB_PROFILE_CONFIG, normalizeJobProfile } from "@/lib/server/constants";

export const TEACHER_ID_COUNTERS = "counters";

export const teacherIdCounterDocId = (prefix: string): string =>
  `teacherId_${prefix}`;

/** `PM` / `AD` / `VT` for a job profile, or "" if it is not a known profile. */
export const prefixForJobProfile = (jobProfile: unknown): string => {
  const normalized = normalizeJobProfile(jobProfile);
  return (JOB_PROFILE_CONFIG as Record<string, string>)[normalized] || "";
};

/** Renders a sequence in the established format (minimum two digits). */
export const formatTeacherId = (prefix: string, sequence: number): string =>
  `${prefix}${String(sequence).padStart(2, "0")}`;

/** Parses the numeric part of an id, or null if it does not match the prefix. */
export const parseTeacherIdSequence = (
  candidateId: unknown,
  prefix: string,
): number | null => {
  const id = String(candidateId || "").trim();
  if (!prefix || !id.startsWith(prefix)) return null;
  const parsed = Number.parseInt(id.slice(prefix.length), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Highest sequence currently in use for a prefix. Only ever called once per
 * prefix, to seed the counter — after that the counter is authoritative and no
 * collection scan happens on teacher creation at all.
 */
export const findMaxTeacherSequence = async (
  firestore: adminFirestore.Firestore,
  prefix: string,
): Promise<number> => {
  const snapshot = await firestore.collection("teachers").get();
  let max = 0;
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    // Both field names exist in live data; check each.
    for (const candidate of [data.teacherId, data.employeeId]) {
      const sequence = parseTeacherIdSequence(candidate, prefix);
      if (sequence !== null && sequence > max) max = sequence;
    }
  });
  return max;
};

/**
 * Reserves the next sequence for a prefix and returns the formatted id.
 *
 * The seed scan deliberately happens OUTSIDE the transaction: a full-collection
 * read inside one would be re-executed on every retry and would widen the
 * contention window. If two callers race while the counter is still missing,
 * the loser's transaction is retried by Firestore, and on that retry it sees
 * the counter the winner just wrote and increments from there.
 */
export const allocateTeacherId = async (
  firestore: adminFirestore.Firestore,
  jobProfile: unknown,
): Promise<string> => {
  const prefix = prefixForJobProfile(jobProfile);
  if (!prefix) {
    throw new Error("Invalid job profile for teacher ID generation.");
  }

  const counterRef = firestore
    .collection(TEACHER_ID_COUNTERS)
    .doc(teacherIdCounterDocId(prefix));

  let seed = 0;
  const existingCounter = await counterRef.get();
  if (!existingCounter.exists) {
    seed = await findMaxTeacherSequence(firestore, prefix);
  }

  // A single counter document is a write hotspot by design — Firestore sustains
  // roughly one write per second per document. That is the right trade here:
  // teachers are created a handful at a time by an administrator, not at volume,
  // and correctness matters far more than throughput. maxAttempts is raised
  // above the SDK default of 5 so a burst (a bulk import, say) still settles
  // rather than surfacing a transaction error to the admin.
  const sequence = await firestore.runTransaction(
    async (tx) => {
      const current = await tx.get(counterRef);
      const lastIssued = current.exists
        ? Number((current.data() as Record<string, unknown>)?.lastIssued) || 0
        : seed;
      const next = lastIssued + 1;
      tx.set(
        counterRef,
        { prefix, lastIssued: next, updatedAt: new Date().toISOString() },
        { merge: true },
      );
      return next;
    },
    { maxAttempts: 20 },
  );

  return formatTeacherId(prefix, sequence);
};

/** True when nothing already holds this teacher id. */
export const isTeacherIdFree = async (
  firestore: adminFirestore.Firestore,
  teacherId: string,
): Promise<boolean> => {
  const byTeacherId = await firestore
    .collection("teachers")
    .where("teacherId", "==", teacherId)
    .limit(1)
    .get();
  if (!byTeacherId.empty) return false;

  const byEmployeeId = await firestore
    .collection("teachers")
    .where("employeeId", "==", teacherId)
    .limit(1)
    .get();
  return byEmployeeId.empty;
};

/**
 * Allocates an id that no existing teacher holds.
 *
 * The counter alone is normally enough, but live data can contain ids the seed
 * scan could not account for (a manual import, or a record written before this
 * allocator existed). Rather than trust the counter blindly, skip anything
 * already taken. Firebase Auth's unique-email constraint is still the final
 * arbiter at creation time.
 */
export const allocateFreeTeacherId = async (
  firestore: adminFirestore.Firestore,
  jobProfile: unknown,
  maxAttempts = 10,
): Promise<string> => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = await allocateTeacherId(firestore, jobProfile);
    if (await isTeacherIdFree(firestore, candidate)) {
      return candidate;
    }
  }
  throw new Error(
    "Could not allocate a free teacher ID after several attempts. " +
      "Check the teachers collection for duplicate IDs.",
  );
};
