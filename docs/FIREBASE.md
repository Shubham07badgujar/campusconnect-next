# Firebase configuration

Security rules used to live only in the Firebase console — pasted in by hand,
unreviewable, untestable and with no way to roll back. They are now in the repo
and covered by an automated test suite.

## Security rules

- Source of truth: [`firestore.rules`](../firestore.rules)
- Tests: [`src/firestore.rules.test.ts`](../src/firestore.rules.test.ts)

Run the tests locally (starts and stops the emulator for you):

```bash
npm run test:rules
```

They also run in CI on every push and pull request.

### Deploying rules

```bash
npx firebase login
npx firebase deploy --only firestore:rules --project campusconnect-38759
```

> A rules change is **not live until this is run.** Editing `firestore.rules`
> and merging it changes nothing in production on its own.

The Firebase Admin SDK service account in `service-account-key.json` is **not**
sufficient for this: it has Firestore data access but not the project-level
`serviceusage` permission the CLI requires, so deploys need an interactive
`firebase login` by someone with owner/editor rights on the project.

## Indexes

Index-as-code is **enabled**: `firebase.json` points at
[`firestore.indexes.json`](../firestore.indexes.json), and that file is the
source of truth.

### What the baseline actually turned out to be

An earlier version of this document warned that composite indexes had been
created ad hoc through the console over time, were unrecorded, and that
committing a guessed file would silently delete them.

**That premise was wrong, and the correction matters.** Exported on 2026-09-22,
confirmed twice — once with `firebase firestore:indexes` and once directly
against the Firestore Admin REST API:

```
composite indexes: {}
```

There were **no composite indexes at all**. The only field override the API
returns is the `__default__` wildcard entry, which is Firestore's built-in
single-field configuration, not a real override — which is why the CLI
correctly reports `"fieldOverrides": []`.

So the baseline was genuinely empty, and adopting index-as-code deleted
nothing.

### The real problem that found

Zero indexes is not the same as zero indexes *needed*. Every distinct query
shape in the codebase was run against the live database to see which ones
Firestore refuses:

- **19 of 23 shapes need no composite index.** Firestore serves queries whose
  filters are all equality (`==`) through a zigzag merge join, however many
  fields are involved — `timetables` filtered on branch + year + semester + day
  is fine.
- **4 shapes require one**, and every one was missing. All four combine a
  filter with an `orderBy` on a *different* field:

| Collection | Query | What it broke |
|---|---|---|
| `announcements` | `active ==` + `orderBy createdAt desc` | notifications |
| `messages` | `chatId ==` + `orderBy timestamp asc` | chat history |
| `studyMaterials` | `department ==` + `orderBy createdAt desc` | study materials list |
| `studyMaterials` | `department ==`, `subject ==` + `orderBy createdAt desc` | study materials, filtered |

Those four are now declared in `firestore.indexes.json` and are **waiting to be
deployed.**

Note that the three-field `studyMaterials` index does *not* cover the two-field
one: Firestore matches an index by prefix, and `subject` sits between
`department` and `createdAt`. Both are needed.

### Why nobody noticed

Because every one of those call sites hides the failure:

- `NotificationsModal.tsx` catches it and runs a simpler query, then sorts in
  JavaScript. Its own comment reads *"Falling back to simple query. Please
  create the required index in Firebase console."* — so notifications have
  always run the fallback path.
- Both study-material screens catch it and render an **empty list** with a
  generic "Failed to load" toast.
- `Chats.tsx:927` has no error handler at all.

This is the danger worth remembering about Firestore indexes: a missing one
does not fail loudly. It raises `FAILED_PRECONDITION`, and code that catches
broadly turns that into an empty screen or a full collection scan.

`src/lib/server/attendance/shared.ts` was the worst case — a bare
`catch { return null }` whose fallback reads every student in the institution.
It now reports the error and names `FAILED_PRECONDITION` specifically, and the
full scan itself logs a warning. The fallback behaviour is unchanged; it is
just no longer silent.

### Deploying indexes

```bash
npm run check:indexes     # what would change, before you change it
npx firebase deploy --only firestore:indexes --project campusconnect-38759
```

Building an index takes minutes; the queries stay broken until it finishes.

### Before any Firestore deploy, run the drift check

```bash
npm run check:indexes
```

`firebase deploy --only firestore` **deletes any composite index not in the
indexes file.** The check reads the live index list and compares:

- 🔴 **live but not committed** — a deploy would delete it. Exits non-zero.
- 🟡 **committed but not live** — deploy pending, or still building.
- ✅ in sync.

The comparison logic lives in `src/lib/server/index-drift.ts` with its own unit
tests, because the dangerous direction cannot be rehearsed against the real
project without creating an index there. The tests cover the traps: field order
is significant (`(a, b)` is not `(b, a)`), sort direction matters, an
`array-contains` field is not an ordered one, and server metadata such as
`name` and `state` must be ignored.

To adopt an index someone created by hand in the console:

```bash
npx tsx scripts/checkFirestoreIndexes.ts --write   # then review the diff
```

## Emulator

`firebase.json` configures the Firestore emulator on port 8080 for tests.

The emulator needs a JDK. `firebase-tools` is pinned to `^14` because v15
requires Java 21 and the development machine has Java 17; bump both together
when the toolchain moves.
