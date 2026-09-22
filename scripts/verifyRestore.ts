/**
 * Proves a restore actually worked, by comparing what is now in the target
 * database against the backup files document by document.
 *
 * This is the half that turns "we have a backup script" into "we have a
 * backup": a dump nobody has ever read back is a guess. Run it against the
 * EMULATOR after scripts/restoreFirestore.ts, which is what `npm run
 * verify:backup` does in one step.
 *
 * Usage:
 *   BACKUP_DIR=backups/2026-... npx tsx scripts/verifyRestore.ts --emulator
 *   npx tsx scripts/verifyRestore.ts --from backups/2026-... --emulator
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback = "") => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const FROM = option("from", process.env.BACKUP_DIR || "");
if (!FROM) {
  console.error("Missing --from <backup directory> (or BACKUP_DIR)");
  process.exit(1);
}
if (flag("emulator")) {
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
}

/** Order-insensitive deep comparison of two encoded documents. */
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
};

const run = async () => {
  const dir = path.resolve(FROM);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
  );

  const { default: admin } = await import("./firebase-admin");
  const { encodeDocument } = await import("../src/lib/server/firestore-codec");
  const firestore = admin.firestore();

  console.log(
    `Verifying restore of ${dir}\nagainst ${
      process.env.FIRESTORE_EMULATOR_HOST
        ? `EMULATOR ${process.env.FIRESTORE_EMULATOR_HOST}`
        : `LIVE ${admin.app().options.projectId}`
    }\n`,
  );

  const failures: string[] = [];
  let checkedDocs = 0;
  let checkedFields = 0;

  for (const name of Object.keys(manifest.collections)) {
    if (name.startsWith("__")) continue;

    const dump = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
    const snapshot = await firestore.collection(name).get();
    const actual = new Map(snapshot.docs.map((d) => [d.id, d]));

    if (actual.size !== dump.documents.length) {
      failures.push(
        `${name}: expected ${dump.documents.length} document(s), found ${actual.size}`,
      );
    }

    for (const entry of dump.documents) {
      const found = actual.get(entry.id);
      if (!found) {
        failures.push(`${name}/${entry.id}: missing after restore`);
        continue;
      }

      const expected = stable(entry.data);
      const got = stable(encodeDocument(found.data() as Record<string, unknown>));

      if (JSON.stringify(expected) !== JSON.stringify(got)) {
        // Name the first differing field rather than printing two documents:
        // the output of this script may be read on a bad day.
        const e = expected as Record<string, unknown>;
        const g = got as Record<string, unknown>;
        const keys = new Set([...Object.keys(e), ...Object.keys(g)]);
        for (const key of keys) {
          if (JSON.stringify(e[key]) !== JSON.stringify(g[key])) {
            failures.push(
              `${name}/${entry.id}: field "${key}" differs ` +
                `(expected ${JSON.stringify(e[key])?.slice(0, 120)}, ` +
                `got ${JSON.stringify(g[key])?.slice(0, 120)})`,
            );
          }
        }
      }
      checkedFields += Object.keys(entry.data).length;
      checkedDocs += 1;
    }

    console.log(`  ${name}: ${dump.documents.length} document(s) checked`);
  }

  if (failures.length > 0) {
    console.error(`\nRESTORE VERIFICATION FAILED (${failures.length} problem(s)):`);
    failures.slice(0, 50).forEach((f) => console.error(`  ${f}`));
    if (failures.length > 50) console.error(`  …and ${failures.length - 50} more`);
    process.exit(1);
  }

  console.log(
    `\n✅ Restore verified: ${checkedDocs} document(s), ${checkedFields} field(s) ` +
      "match the backup exactly.",
  );
};

run().catch((error) => {
  console.error("Verification FAILED:", error.message || error);
  process.exit(1);
});
