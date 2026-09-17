/**
 * Repairs student records that can never be marked present.
 *
 * WHY: until this was fixed, POST /api/users (the admin "Add Student" button)
 * wrote only `users/{uid}` and omitted `prn` and `subjects`, and never wrote the
 * `students/{uid}` document at all. Two things break as a result:
 *
 *   1. Attendance enrolment (studentBelongsToSession) requires a non-empty
 *      `subjects` array intersecting the session's subject, so those students
 *      were silently excluded from EVERY attendance session, permanently.
 *   2. Password reset by roll number queries the `students` collection, so it
 *      could never find them either.
 *
 * The route is fixed, but existing records stay broken until repaired. This
 * script finds and repairs them, deriving `subjects` from the configured
 * subjectSets for each student's branch / year / semester.
 *
 * Usage:
 *   node scripts/repairStudentProfiles.js            # DRY RUN (default) — reports only
 *   node scripts/repairStudentProfiles.js --apply    # actually write the repairs
 *
 * Idempotent: re-running after a successful repair reports nothing to do.
 */
const admin = require("./firebase-admin");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

const firestore = admin.firestore();

// Mirrors makeSubjectSetDocId in src/lib/server/constants.ts
const makeSubjectSetDocId = (branch, year, semester) =>
  `${branch}_${year}_${semester}`.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();

const BRANCH_ALIASES = {
  computer: "Computer Engineering",
  "computer engineering": "Computer Engineering",
  electrical: "Electrical Engineering",
  "electrical engineering": "Electrical Engineering",
  civil: "Civil Engineering",
  "civil engineering": "Civil Engineering",
  mechanical: "Mechanical Engineering",
  "mechanical engineering": "Mechanical Engineering",
  entc: "Electronics And TeleCommunication Engineering",
  electronics: "Electronics And TeleCommunication Engineering",
  "electronics and telecommunication":
    "Electronics And TeleCommunication Engineering",
  "electronics and telecommunication engineering":
    "Electronics And TeleCommunication Engineering",
  instrumentation: "Instrumentation Engineering",
  "instrumentation engineering": "Instrumentation Engineering",
};
const YEAR_ALIASES = {
  1: "1st", "1st": "1st", first: "1st",
  2: "2nd", "2nd": "2nd", second: "2nd",
  3: "3rd", "3rd": "3rd", third: "3rd",
  4: "4th", "4th": "4th", fourth: "4th",
};
const SEMESTER_ALIASES = {
  1: "1", 2: "2", sem1: "1", sem2: "2", semester1: "1", semester2: "2",
  first: "1", second: "2",
};

const normBranch = (v) => BRANCH_ALIASES[String(v || "").trim().toLowerCase()] || "";
const normYear = (v) => YEAR_ALIASES[String(v || "").trim().toLowerCase()] || "";
const normSem = (v) =>
  SEMESTER_ALIASES[String(v || "").trim().toLowerCase().replace(/\s+/g, "")] || "";

async function loadSubjectSets() {
  const snapshot = await firestore.collection("subjectSets").get();
  const map = {};
  snapshot.docs.forEach((doc) => {
    const d = doc.data() || {};
    if (!d.branch || !d.year) return;
    map[d.branch] = map[d.branch] || {};
    map[d.branch][d.year] = map[d.branch][d.year] || {};
    map[d.branch][d.year][normSem(d.semester) || "1"] = Array.isArray(d.subjects)
      ? d.subjects
      : [];
  });
  return map;
}

(async () => {
  console.log(
    APPLY
      ? "MODE: APPLY — repairs will be written."
      : "MODE: DRY RUN — no changes will be made. Re-run with --apply to repair.",
  );

  const subjectSets = await loadSubjectSets();
  const usersSnapshot = await firestore
    .collection("users")
    .where("role", "==", "Student")
    .get();

  const repairable = [];
  const unfixable = [];
  let healthy = 0;

  for (const doc of usersSnapshot.docs) {
    const data = doc.data() || {};
    const uid = String(data.uid || doc.id);

    const studentDoc = await firestore.collection("students").doc(uid).get();
    const hasSubjects =
      Array.isArray(data.subjects) && data.subjects.filter(Boolean).length > 0;
    const hasPrn = Boolean(String(data.prn || "").trim());
    const missingStudentDoc = !studentDoc.exists;

    if (hasSubjects && hasPrn && !missingStudentDoc) {
      healthy += 1;
      continue;
    }

    const branch = normBranch(data.dept || data.department);
    const year = normYear(data.year);
    const semester = normSem(data.semester);
    const rollNo = String(data.rollNo || data.rollNumber || data.prn || "")
      .trim()
      .toUpperCase();
    const subjects = (subjectSets[branch] || {})[year]
      ? (subjectSets[branch][year][semester] || [])
      : [];

    const reasons = [];
    if (!hasSubjects) reasons.push("no subjects (cannot be marked present)");
    if (!hasPrn) reasons.push("no prn");
    if (missingStudentDoc) reasons.push("no students/ doc (password reset broken)");

    const blockers = [];
    if (!branch) blockers.push("unrecognised department");
    if (!year) blockers.push("invalid year");
    if (!semester) blockers.push("invalid semester");
    if (!rollNo) blockers.push("no roll number");
    if (branch && year && semester && subjects.length === 0) {
      blockers.push(`no subject set for ${branch} / ${year} / Sem ${semester}`);
    }

    const entry = {
      uid,
      name: data.name || "(unnamed)",
      rollNo,
      branch,
      year,
      semester,
      reasons,
      blockers,
      subjects,
      existing: data,
      missingStudentDoc,
    };

    if (blockers.length > 0) unfixable.push(entry);
    else repairable.push(entry);
  }

  console.log(`\nScanned ${usersSnapshot.size} students.`);
  console.log(`  healthy:    ${healthy}`);
  console.log(`  repairable: ${repairable.length}`);
  console.log(`  unfixable:  ${unfixable.length}`);

  if (repairable.length) {
    console.log("\n--- REPAIRABLE ---");
    repairable.forEach((e) =>
      console.log(
        `  ${e.rollNo.padEnd(10)} ${String(e.name).padEnd(22)} ${e.branch} ${e.year} Sem${e.semester}` +
          `  [${e.reasons.join("; ")}] -> ${e.subjects.length} subjects`,
      ),
    );
  }

  if (unfixable.length) {
    console.log("\n--- NEEDS MANUAL ATTENTION ---");
    unfixable.forEach((e) =>
      console.log(
        `  ${(e.rollNo || e.uid).padEnd(10)} ${String(e.name).padEnd(22)} [${e.blockers.join("; ")}]`,
      ),
    );
  }

  if (!APPLY) {
    console.log("\nDry run complete. No changes written.");
    process.exit(0);
  }

  let repaired = 0;
  for (const e of repairable) {
    // Merge so nothing already present is clobbered — this only fills the gaps
    // that made the record unusable.
    const patch = {
      uid: e.uid,
      prn: e.rollNo,
      rollNo: e.rollNo,
      rollNumber: e.rollNo,
      loginId: e.existing.loginId || e.rollNo,
      dept: e.branch,
      department: e.branch,
      year: e.year,
      semester: e.semester,
      subjects: e.subjects,
      role: "Student",
      repairedAt: new Date().toISOString(),
      repairSource: "repairStudentProfiles",
    };

    await firestore.collection("users").doc(e.uid).set(patch, { merge: true });
    await firestore
      .collection("students")
      .doc(e.uid)
      .set({ ...e.existing, ...patch }, { merge: true });
    repaired += 1;
  }

  console.log(`\nRepaired ${repaired} student(s).`);
  if (unfixable.length) {
    console.log(
      `${unfixable.length} still need attention — fix their branch/year/semester ` +
        "or configure the missing subject set, then re-run.",
    );
  }
  process.exit(0);
})().catch((error) => {
  console.error("Repair failed:", error);
  process.exit(1);
});
