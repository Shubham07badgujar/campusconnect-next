/**
 * Compares the committed firestore.indexes.json against the indexes that
 * actually exist in the live project.
 *
 * WHY THIS IS THE IMPORTANT SCRIPT: `firebase deploy --only firestore` DELETES
 * any composite index that is not in the indexes file. On this project that is
 * unusually dangerous, because a dropped index does not announce itself — the
 * query fails with FAILED_PRECONDITION, and at least one call site catches that
 * and falls back to reading an entire collection. The symptom is not an error;
 * it is attendance getting slower and the Firestore bill getting larger.
 *
 * So the repo and production drifting apart must be something a person finds
 * out by running a command, not by an incident. Run this before any deploy that
 * touches Firestore.
 *
 * Reads only — it never creates, changes or deletes an index.
 *
 * Usage:
 *   npm run check:indexes
 *   npx tsx scripts/checkFirestoreIndexes.ts --write   # refresh the baseline
 */
import fs from "node:fs";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";
import {
  type CompositeIndex,
  type IndexField,
  describeIndex,
  diffIndexes,
} from "../src/lib/server/index-drift";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");

const INDEX_FILE = path.resolve("firestore.indexes.json");

const resolveCredentials = () => {
  const explicit = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const local = path.resolve(
    process.env.FIREBASE_ADMIN_SDK_KEY || "service-account-key.json",
  );
  if (fs.existsSync(local)) return local;
  throw new Error(
    "No service account credentials found. Set GOOGLE_APPLICATION_CREDENTIALS " +
      "or place service-account-key.json at the repo root.",
  );
};

const fetchLive = async () => {
  const keyFile = resolveCredentials();
  const projectId = JSON.parse(fs.readFileSync(keyFile, "utf8")).project_id;

  const auth = new GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  const client = await auth.getClient();
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;

  const indexes: CompositeIndex[] = [];
  let pageToken = "";
  do {
    const url =
      `${base}/collectionGroups/-/indexes` +
      (pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "");
    const res: any = await client.request({ url });
    for (const raw of res.data.indexes || []) {
      // `name` encodes the collection group; the payload does not repeat it.
      const match = /collectionGroups\/([^/]+)\/indexes\//.exec(raw.name || "");
      indexes.push({
        collectionGroup: match ? match[1] : "(unknown)",
        queryScope: raw.queryScope || "COLLECTION",
        // __name__ is appended by Firestore itself and is not written in the
        // indexes file, so it is dropped for comparison purposes.
        fields: (raw.fields || []).filter(
          (f: IndexField) => f.fieldPath !== "__name__",
        ),
      });
    }
    pageToken = res.data.nextPageToken || "";
  } while (pageToken);

  return { projectId, indexes };
};

const run = async () => {
  const { projectId, indexes: live } = await fetchLive();

  if (WRITE) {
    const payload = {
      indexes: live.map((i) => ({
        collectionGroup: i.collectionGroup,
        queryScope: i.queryScope,
        fields: i.fields,
      })),
      fieldOverrides: [],
    };
    fs.writeFileSync(INDEX_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(
      `Wrote ${live.length} live index(es) to ${path.basename(INDEX_FILE)}`,
    );
    return;
  }

  if (!fs.existsSync(INDEX_FILE)) {
    throw new Error(
      `${path.basename(INDEX_FILE)} does not exist. Create the baseline with --write.`,
    );
  }

  const committed = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  const declared: CompositeIndex[] = committed.indexes || [];

  const { wouldBeDeleted, notYetDeployed, inSync } = diffIndexes(live, declared);

  console.log(`Project:   ${projectId}`);
  console.log(`Live:      ${live.length} composite index(es)`);
  console.log(`Committed: ${declared.length} composite index(es)\n`);

  if (inSync) {
    console.log("✅ In sync. A firestore deploy would not change any index.");
    return;
  }

  if (wouldBeDeleted.length > 0) {
    console.error(
      `🔴 ${wouldBeDeleted.length} index(es) exist in production but are NOT in ` +
        `${path.basename(INDEX_FILE)}.\n` +
        "   Deploying now would DELETE them, and the queries that rely on them\n" +
        "   would degrade silently rather than fail loudly:\n",
    );
    for (const index of wouldBeDeleted) {
      console.error(`     ${describeIndex(index)}`);
    }
    console.error(
      "\n   Fix: run with --write to adopt them into the baseline, then review the diff.",
    );
  }

  if (notYetDeployed.length > 0) {
    console.warn(
      `\n🟡 ${notYetDeployed.length} index(es) are committed but not yet live ` +
        "(deploy pending, or still building):\n",
    );
    for (const index of notYetDeployed) {
      console.warn(`     ${describeIndex(index)}`);
    }
  }

  // Only a pending deploy is a normal state; a deletion is not.
  if (wouldBeDeleted.length > 0) process.exit(1);
};

run().catch((error) => {
  console.error("Index check FAILED:", error.message || error);
  process.exit(1);
});
