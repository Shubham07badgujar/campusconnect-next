/**
 * Takes a full backup of Firestore, and optionally of the Firebase Auth user
 * list.
 *
 * WHY: there were no backups of any kind — no scheduled export, no tested
 * restore path. Combined with bulk operations that record no previous values,
 * one mistaken upload was unrecoverable.
 *
 * WHAT IT WRITES: one directory per run, containing one JSON file per
 * collection plus a manifest. Values are written through the type-preserving
 * codec in src/lib/server/firestore-codec.ts, because plain JSON silently
 * destroys Timestamps, Bytes, GeoPoints, NaN and undefined — a backup that
 * changes the data on the way through is not a backup.
 *
 * Usage:
 *   npx tsx scripts/backupFirestore.ts
 *   npx tsx scripts/backupFirestore.ts --out backups/nightly
 *   npx tsx scripts/backupFirestore.ts --include-auth
 *   npx tsx scripts/backupFirestore.ts --include-auth --include-password-hashes
 *
 * ⚠ THE OUTPUT CONTAINS PERSONAL DATA: student names, email addresses, phone
 * numbers, roll numbers, staff contact details, and — if any student has
 * registered a face — biometric templates. Under the DPDP Act that makes the
 * backup directory itself regulated data. It is gitignored; keep it encrypted
 * at rest and delete it on a schedule. See docs/BACKUPS.md.
 *
 * --include-password-hashes additionally writes Firebase's password hashes,
 * which makes the file credential-equivalent. It is off by default for that
 * reason; without it, restored accounts need a password reset.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import admin from "./firebase-admin";
import { encodeDocument } from "../src/lib/server/firestore-codec";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const INCLUDE_AUTH = flag("include-auth");
const INCLUDE_PASSWORD_HASHES = flag("include-password-hashes");

type CollectionDump = {
  collection: string;
  documents: {
    id: string;
    path: string;
    data: Record<string, unknown>;
    subcollections?: Record<string, CollectionDump["documents"]>;
  }[];
};

/**
 * Reads a collection, recursing into any subcollections.
 *
 * Nothing in the app uses subcollections today, but a backup that quietly
 * skipped them the day someone added one would be the worst kind of bug: it
 * looks like it worked.
 */
const dumpCollection = async (
  ref: FirebaseFirestore.CollectionReference,
): Promise<CollectionDump> => {
  const snapshot = await ref.get();
  const documents: CollectionDump["documents"] = [];

  for (const doc of snapshot.docs) {
    const entry: CollectionDump["documents"][number] = {
      id: doc.id,
      path: doc.ref.path,
      data: encodeDocument(doc.data() as Record<string, unknown>),
    };

    const subs = await doc.ref.listCollections();
    if (subs.length > 0) {
      entry.subcollections = {};
      for (const sub of subs) {
        entry.subcollections[sub.id] = (await dumpCollection(sub)).documents;
      }
    }
    documents.push(entry);
  }

  return { collection: ref.id, documents };
};

const dumpAuthUsers = async () => {
  const users: Record<string, unknown>[] = [];
  let pageToken: string | undefined;

  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const user of page.users) {
      users.push({
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        photoURL: user.photoURL,
        phoneNumber: user.phoneNumber,
        disabled: user.disabled,
        // The custom claims ARE the authorization model (admin / teacher), so
        // an Auth restore without them would silently demote every member of
        // staff.
        customClaims: user.customClaims || {},
        metadata: {
          creationTime: user.metadata.creationTime,
          lastSignInTime: user.metadata.lastSignInTime,
        },
        providerIds: user.providerData.map((p) => p.providerId),
        ...(INCLUDE_PASSWORD_HASHES
          ? { passwordHash: user.passwordHash, passwordSalt: user.passwordSalt }
          : {}),
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return users;
};

const run = async () => {
  const firestore = admin.firestore();
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve(option("out", path.join("backups", stamp)));
  fs.mkdirSync(outDir, { recursive: true });

  const collections = await firestore.listCollections();
  const manifestCollections: Record<string, { documents: number; sha256: string }> = {};
  let totalDocuments = 0;

  console.log(`Backing up ${collections.length} collection(s) to ${outDir}`);

  for (const ref of collections) {
    const dump = await dumpCollection(ref);
    const json = JSON.stringify(dump, null, 2);
    const file = path.join(outDir, `${ref.id}.json`);
    fs.writeFileSync(file, json, "utf8");

    // A checksum is what lets a restore prove the file was not truncated or
    // altered between being written and being read back.
    const sha256 = createHash("sha256").update(json).digest("hex");
    manifestCollections[ref.id] = { documents: dump.documents.length, sha256 };
    totalDocuments += dump.documents.length;
    console.log(`  ${ref.id}: ${dump.documents.length} document(s)`);
  }

  let authUsers = 0;
  if (INCLUDE_AUTH) {
    const users = await dumpAuthUsers();
    authUsers = users.length;
    const json = JSON.stringify({ users }, null, 2);
    fs.writeFileSync(path.join(outDir, "__auth_users.json"), json, "utf8");
    manifestCollections["__auth_users"] = {
      documents: users.length,
      sha256: createHash("sha256").update(json).digest("hex"),
    };
    console.log(`  Firebase Auth: ${users.length} account(s)`);
  }

  const manifest = {
    createdAt: startedAt.toISOString(),
    projectId: admin.app().options.projectId,
    format: 1,
    totalDocuments,
    authUsers,
    includesPasswordHashes: INCLUDE_AUTH && INCLUDE_PASSWORD_HASHES,
    collections: manifestCollections,
  };
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log(
    `\nDone: ${totalDocuments} document(s)` +
      `${INCLUDE_AUTH ? ` + ${authUsers} Auth account(s)` : ""} -> ${outDir}`,
  );
  if (!INCLUDE_AUTH) {
    console.log(
      "NOTE: Firebase Auth accounts were NOT backed up. Firestore alone cannot " +
        "restore logins — re-run with --include-auth.",
    );
  }
  console.log(
    "This directory contains personal data. Keep it encrypted and delete it " +
      "on a schedule (docs/BACKUPS.md).",
  );
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backup FAILED:", error);
    // A non-zero exit is what lets a scheduler notice a silent failure.
    process.exit(1);
  });
