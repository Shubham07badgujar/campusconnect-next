# Backups and restore

Status as of 2026-09-22: **working, rehearsed, and manual.** The scripts exist
and the restore path has been tested end to end. What is *not* yet in place is
an automatic schedule — see [What is still missing](#what-is-still-missing).

---

## Why this exists

Before this there was no backup of any kind: no export, no snapshot, no tested
restore path. Combined with bulk operations that record no previous values (the
bulk academic update processes rows one at a time, outside a transaction, and
never stores what it overwrote), **a single mistaken upload was
unrecoverable.**

Uploading the wrong spreadsheet is the single most likely operator mistake in
this product, so this is the thing that most needed fixing.

> **An untested backup is not a backup.** That is why `npm run verify:backup`
> exists and why it is part of this document rather than an afterthought: it
> restores a real backup into the emulator and compares every field.

---

## Taking a backup

```bash
npm run backup
```

Writes `backups/<timestamp>/` containing:

| File | Contents |
|---|---|
| `<collection>.json` | one file per Firestore collection, documents and subcollections |
| `__auth_users.json` | Firebase Auth accounts, including the `admin` / `teacher` custom claims |
| `manifest.json` | when it was taken, which project, document counts, and a SHA-256 per file |

`npm run backup` includes Auth accounts. To take Firestore only:

```bash
npx tsx scripts/backupFirestore.ts
```

### Why Auth accounts matter

Firestore alone **cannot restore logins.** The accounts live in Firebase Auth,
and the `admin` / `teacher` custom claims on them *are* the authorization model
— `firestore.rules` and every API guard read those claims. A Firestore-only
restore would bring the data back with every member of staff silently demoted
to a student.

### Why plain JSON would not do

Firestore stores values JSON cannot represent, and every one of them fails
*quietly*:

| Value | What naive JSON does | Consequence |
|---|---|---|
| `Timestamp` | becomes `{_seconds, _nanoseconds}` | `createdAt` stops being a date; range queries silently match nothing |
| Bytes / `Buffer` | becomes `{"0":12,"1":99,…}` | a restored face descriptor is corrupt, with no error |
| `GeoPoint` | becomes a plain map | geofencing comparisons stop working |
| `NaN` / `Infinity` | becomes `null` | a real value becomes a *different* real value |
| `undefined` | the key disappears | field silently lost |

So every value is written with an explicit type tag by
`src/lib/server/firestore-codec.ts` and rebuilt on restore. That codec has its
own unit tests (`firestore-codec.test.ts`) asserting the round trip, because
this is the part where a backup can lie to you.

---

## Rehearsing a restore

Do this **before** you ever need it, and after any change to the codec.

```bash
npm run verify:backup   # reads BACKUP_DIR
```

On Windows PowerShell:

```powershell
$env:BACKUP_DIR="backups\2026-09-22T06-23-03-286Z"; npm run verify:backup
```

It starts the Firestore emulator, restores the backup into it, reads every
document back, and compares field by field against the files. It exits non-zero
on any mismatch.

Last rehearsal: **2026-09-22 — 184 documents, 2250 fields, exact match.**

---

## Restoring for real

> Restoring **overwrites** the target. Take a fresh backup of the current state
> first, even if you believe the current state is broken — it is the only copy
> of whatever actually happened.

```bash
# 1. capture what is there now
npm run backup

# 2. see what would change, without writing
npx tsx scripts/restoreFirestore.ts --from backups/<good-backup> --dry-run

# 3. restore a single collection if that is all that is damaged
npx tsx scripts/restoreFirestore.ts --from backups/<good-backup> \
  --only users,students \
  --project campusconnect-38759 --i-understand-this-overwrites-live-data
```

The script refuses to touch a live project unless you pass **both**
`--project <exact id>` and `--i-understand-this-overwrites-live-data`. That
friction is deliberate: you only reach for a restore script on a bad day, and a
bad day is exactly when someone runs it against the wrong thing.

It also verifies the SHA-256 of every file against the manifest before writing
anything, and refuses the whole restore if one does not match — a truncated or
hand-edited backup must never be written over live data.

Both rails are verified working; see the commit that introduced them.

### Restoring Firebase Auth accounts

`restoreFirestore.ts` does **not** re-import Auth accounts. Recreating them with
working passwords needs the project's password-hash parameters
(`firebase auth:export` / `auth:import` with the matching `hash-config`), which
this repository does not hold.

If accounts are lost, the practical path is:

1. Recreate them from `__auth_users.json` with `admin.auth().createUser()`,
   preserving the **uid** — every Firestore document keys off it.
2. Re-apply `customClaims` from the same file, or staff lose their roles.
3. Have everyone reset their password.

Taking the backup with `--include-password-hashes` would make a true restore
possible, but it makes the file **credential-equivalent**. It is off by default
for that reason. Only use it if the backup is encrypted at rest.

---

## This backup is regulated personal data

The output contains student names, email addresses, phone numbers and roll
numbers, staff contact details and login identifiers, and — once any student
registers a face — **biometric templates**.

Under India's DPDP Act that makes the backup directory itself personal data.

- `backups/` is **gitignored**. Never commit one, and never attach one to a
  ticket.
- Keep copies **encrypted at rest** (an encrypted volume, or `age`/`gpg` the
  directory before it leaves the machine).
- **Delete on a schedule.** Keeping every backup forever means keeping the data
  of students who have left, which is its own compliance problem. A defensible
  default is daily for 30 days, then monthly for a year.
- Storing backups in a GitHub Actions artifact is *not* recommended for this
  reason, even though it is the easy automation route.

---

## What is still missing

1. **A schedule.** Backups are currently manual. Until this is automated, the
   real recovery point is "whenever someone last remembered", which is not a
   recovery point.

2. **Off-machine storage.** A backup on the same laptop as nothing else is one
   disk failure from being no backup at all.

3. **The managed option, which is the real answer.** Firestore's own scheduled
   export to a Cloud Storage bucket, plus Point-in-Time Recovery, is more
   reliable than any script here: it is consistent, incremental, off-site, and
   restores through Google's own tooling. It needs the project on the **Blaze
   (pay-as-you-go) plan** — for this data volume the cost is pennies a month,
   but it is a billing change, so it is a decision for the project owner rather
   than something to switch on unasked.

   Should you go that route, the scripts here stay useful for point-in-time
   inspection and for restoring a single collection, which managed exports do
   less conveniently.
