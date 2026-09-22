/**
 * Publishes a `teacherDirectory` entry for every existing teacher.
 *
 * WHY: `teachers` documents hold staff mobile numbers and the loginId /
 * authEmail that IS the sign-in identifier, so the security rules now restrict
 * that collection to staff. Students still need the staff directory (to start a
 * chat) and the subject-to-teacher map on their dashboard, so those screens
 * read `teacherDirectory` — a projection carrying only safe fields.
 *
 * The API routes write that projection from now on. Teachers created before
 * this change have no entry yet, and would simply vanish from the student
 * directory until they are next edited. This backfills them.
 *
 * It is written in TypeScript and run through tsx so that it imports the SAME
 * projection function the API routes use. Duplicating the field list in a
 * throwaway script is how the two drift apart, and the whole point of the
 * projection is that the excluded fields stay excluded.
 *
 * Usage:
 *   npx tsx scripts/backfillTeacherDirectory.ts           # DRY RUN — reports only
 *   npx tsx scripts/backfillTeacherDirectory.ts --apply   # write the entries
 *
 * Idempotent: re-running after a successful backfill reports nothing to do.
 */
import admin from "./firebase-admin";
import {
  TEACHER_DIRECTORY,
  buildTeacherDirectoryEntry,
} from "../src/lib/server/teacher-directory";

const APPLY = process.argv.slice(2).includes("--apply");

// Fields that must never reach the directory. Asserted rather than assumed:
// if someone widens buildTeacherDirectoryEntry, this script refuses to publish
// instead of quietly exposing staff contact details campus-wide.
const FORBIDDEN_FIELDS = [
  "mobile",
  "phone",
  "contactEmail",
  "authEmail",
  "loginId",
  "jobProfile",
];

const run = async () => {
  const firestore = admin.firestore();
  const teachers = await firestore.collection("teachers").get();
  const existing = await firestore.collection(TEACHER_DIRECTORY).get();
  const existingIds = new Set(existing.docs.map((d) => d.id));

  console.log(
    `${teachers.size} teacher record(s); ${existing.size} directory entr(ies) already published.`,
  );
  console.log(APPLY ? "Mode: APPLY\n" : "Mode: DRY RUN (pass --apply to write)\n");

  let written = 0;
  let batch = firestore.batch();
  let ops = 0;

  for (const docSnap of teachers.docs) {
    const teacher = docSnap.data() || {};
    const entry = buildTeacherDirectoryEntry(docSnap.id, teacher);

    const leaked = FORBIDDEN_FIELDS.filter((f) => f in entry);
    if (leaked.length > 0) {
      throw new Error(
        `Projection would publish restricted field(s): ${leaked.join(", ")}. ` +
          "Fix buildTeacherDirectoryEntry before running this script.",
      );
    }
    if (!entry.name) {
      console.log(`  skip ${docSnap.id} — record has no name`);
      continue;
    }

    const action = existingIds.has(docSnap.id) ? "refresh" : "publish";
    console.log(
      `  ${action} ${docSnap.id} — ${entry.name}` +
        `${entry.teacherId ? ` (${entry.teacherId})` : ""}` +
        `${entry.dept ? `, ${entry.dept}` : ""}`,
    );

    if (APPLY) {
      batch.set(firestore.collection(TEACHER_DIRECTORY).doc(docSnap.id), entry);
      ops += 1;
      // Firestore caps a batch at 500 operations.
      if (ops >= 400) {
        await batch.commit();
        batch = firestore.batch();
        ops = 0;
      }
    }
    written += 1;
  }

  if (APPLY && ops > 0) await batch.commit();

  // Entries whose teacher has since been deleted would keep the teacher listed
  // in the student directory forever. The delete route removes them now; this
  // clears any left behind by a deletion that predates it.
  const teacherIds = new Set(teachers.docs.map((d) => d.id));
  const orphans = existing.docs.filter((d) => !teacherIds.has(d.id));
  for (const orphan of orphans) {
    console.log(`  remove ${orphan.id} — no matching teacher record`);
    if (APPLY) await orphan.ref.delete();
  }

  console.log(
    `\n${APPLY ? "Published" : "Would publish"} ${written} entr(ies), ` +
      `${APPLY ? "removed" : "would remove"} ${orphans.length} orphan(s).`,
  );
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
