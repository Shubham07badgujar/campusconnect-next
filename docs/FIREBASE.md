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

## Indexes — read this before enabling index-as-code

`firebase.json` deliberately has **no `indexes` key**, and there is no
`firestore.indexes.json` in the repo. That is not an oversight.

Composite indexes on this project were created ad hoc through the console, over
time, and are not recorded anywhere. `firebase deploy --only firestore` deletes
any index that is not in the indexes file — so committing a guessed or empty
file and deploying it would **silently delete live indexes**.

"Silently" is the important word. `src/lib/server/attendance/shared.ts` swallows
a failed query and falls back to reading every student in the institution, so a
dropped index does not raise an error — it degrades into a full table scan on
every attendance session start.

To adopt index-as-code safely:

1. Export what actually exists first:
   ```bash
   npx firebase firestore:indexes --project campusconnect-38759 > firestore.indexes.json
   ```
2. Commit that file **unmodified**, as the baseline.
3. Only then add `"indexes": "firestore.indexes.json"` to `firebase.json`.
4. Change indexes by editing the file and reviewing the diff.

## Emulator

`firebase.json` configures the Firestore emulator on port 8080 for tests.

The emulator needs a JDK. `firebase-tools` is pinned to `^14` because v15
requires Java 21 and the development machine has Java 17; bump both together
when the toolchain moves.
