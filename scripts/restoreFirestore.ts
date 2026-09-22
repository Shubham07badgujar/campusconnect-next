/**
 * Restores a backup produced by scripts/backupFirestore.ts.
 *
 * "An untested backup is not a backup." This script exists so the restore path
 * can be REHEARSED, not assumed — see the `verify:backup` npm script, which
 * takes a real backup, restores it into the Firestore emulator, and compares
 * the result document by document.
 *
 * SAFETY: the default target is the local emulator, never production. Writing
 * to a real project requires BOTH --project <id> naming it exactly and
 * --i-understand-this-overwrites-live-data. That is deliberate friction: the
 * whole reason to own a restore script is a bad day, and a bad day is exactly
 * when someone runs it against the wrong thing.
 *
 * Usage:
 *   # rehearse into the emulator (start it first: firebase emulators:start --only firestore)
 *   npx tsx scripts/restoreFirestore.ts --from backups/2026-09-22T... --emulator
 *
 *   # dry run against anything
 *   npx tsx scripts/restoreFirestore.ts --from <dir> --emulator --dry-run
 *
 *   # the real thing
 *   npx tsx scripts/restoreFirestore.ts --from <dir> \
 *     --project campusconnect-38759 --i-understand-this-overwrites-live-data
 *
 * Restores Firestore documents only. Firebase Auth accounts are backed up by
 * backupFirestore.ts --include-auth but are NOT re-imported here; that needs
 * the project's password hash parameters and is documented in docs/BACKUPS.md.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback = "") => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const FROM = option("from", process.env.BACKUP_DIR || "");
const USE_EMULATOR = flag("emulator");
const DRY_RUN = flag("dry-run");
const TARGET_PROJECT = option("project");
const CONFIRMED = flag("i-understand-this-overwrites-live-data");
const ONLY = option("only"); // comma-separated collection names

if (!FROM) {
  console.error("Missing --from <backup directory> (or BACKUP_DIR)");
  process.exit(1);
}

// Point the Admin SDK at the emulator BEFORE it is imported: the client reads
// this variable when it is constructed.
if (USE_EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
}

const run = async () => {
  const dir = path.resolve(FROM);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No manifest.json in ${dir} — is that a backup directory?`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  // Imported late so FIRESTORE_EMULATOR_HOST is already set.
  const { default: admin } = await import("./firebase-admin");
  const { decodeDocument } = await import("../src/lib/server/firestore-codec");

  const liveProject = admin.app().options.projectId;
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

  if (!USE_EMULATOR && !DRY_RUN) {
    if (!CONFIRMED || TARGET_PROJECT !== liveProject) {
      throw new Error(
        `Refusing to restore into the live project "${liveProject}".\n` +
          "Pass --emulator to rehearse, or both " +
          `--project ${liveProject} and --i-understand-this-overwrites-live-data.`,
      );
    }
  }

  console.log(`Backup:   ${dir}`);
  console.log(`Taken:    ${manifest.createdAt} (project ${manifest.projectId})`);
  console.log(
    `Target:   ${emulatorHost ? `EMULATOR ${emulatorHost}` : `LIVE ${liveProject}`}`,
  );
  console.log(DRY_RUN ? "Mode:     DRY RUN\n" : "Mode:     WRITING\n");

  const wanted = ONLY ? new Set(ONLY.split(",").map((s) => s.trim())) : null;
  const firestore = admin.firestore();
  let restored = 0;
  const problems: string[] = [];

  for (const [name, meta] of Object.entries(manifest.collections as Record<
    string,
    { documents: number; sha256: string }
  >)) {
    if (name.startsWith("__")) continue; // __auth_users is not a Firestore collection
    if (wanted && !wanted.has(name)) continue;

    const file = path.join(dir, `${name}.json`);
    const raw = fs.readFileSync(file, "utf8");

    // Verify before trusting. A truncated or edited file must not be written
    // over live data.
    const sha256 = createHash("sha256").update(raw).digest("hex");
    if (sha256 !== meta.sha256) {
      problems.push(`${name}: checksum mismatch — file does not match the manifest`);
      continue;
    }

    const dump = JSON.parse(raw);
    let batch = firestore.batch();
    let ops = 0;

    const writeDocs = async (docs: any[]) => {
      for (const entry of docs) {
        const data = decodeDocument(entry.data, firestore);
        if (!DRY_RUN) {
          // set() without merge: restore means "make it look like the backup",
          // not "blend with whatever is there now".
          batch.set(firestore.doc(entry.path), data);
          ops += 1;
          // Firestore caps a batch at 500 operations.
          if (ops >= 400) {
            await batch.commit();
            batch = firestore.batch();
            ops = 0;
          }
        }
        restored += 1;

        for (const [subName, subDocs] of Object.entries(
          (entry.subcollections || {}) as Record<string, any[]>,
        )) {
          void subName;
          await writeDocs(subDocs);
        }
      }
    };

    await writeDocs(dump.documents);
    if (!DRY_RUN && ops > 0) await batch.commit();

    console.log(`  ${name}: ${dump.documents.length} document(s)`);
  }

  if (problems.length > 0) {
    console.error("\nRefused to restore:");
    problems.forEach((p) => console.error(`  ${p}`));
    throw new Error("Backup integrity check failed");
  }

  console.log(
    `\n${DRY_RUN ? "Would restore" : "Restored"} ${restored} document(s).`,
  );
  if (manifest.authUsers > 0) {
    console.log(
      `NOTE: the backup also holds ${manifest.authUsers} Firebase Auth account(s), ` +
        "which this script does not import. See docs/BACKUPS.md.",
    );
  }
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Restore FAILED:", error.message || error);
    process.exit(1);
  });
