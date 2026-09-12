/**
 * createDemoAccounts.js
 *
 * Creates demo login accounts: 1 admin, 3 teachers, 3 students.
 * Safe to re-run: existing accounts are updated (password reset to the demo one).
 *
 * Usage (from backend/, with .env + service-account-key.json configured):
 *   node createDemoAccounts.js
 */

require("dotenv").config();
const admin = require("./firebase-admin");

const BRANCH = "Computer Engineering";
const YEAR = "2nd";
const SEMESTER = "1";

const ADMIN_ACCOUNT = {
  name: "Demo Admin",
  email: "demo.admin@campusconnect.demo",
  password: "Admin@Demo2026",
};

const TEACHERS = [
  {
    name: "Demo Teacher One",
    teacherId: "PM01",
    password: "Teach@Demo01",
    jobProfile: "Permanent Faculty",
    mobile: "9000000001",
  },
  {
    name: "Demo Teacher Two",
    teacherId: "PM02",
    password: "Teach@Demo02",
    jobProfile: "Permanent Faculty",
    mobile: "9000000002",
  },
  {
    name: "Demo Teacher Three",
    teacherId: "PM03",
    password: "Teach@Demo03",
    jobProfile: "Permanent Faculty",
    mobile: "9000000003",
  },
];

const STUDENTS = [
  {
    name: "Demo Student One",
    prn: "DEMO2601",
    password: "Stud@Demo01",
    phone: "9111111101",
  },
  {
    name: "Demo Student Two",
    prn: "DEMO2602",
    password: "Stud@Demo02",
    phone: "9111111102",
  },
  {
    name: "Demo Student Three",
    prn: "DEMO2603",
    password: "Stud@Demo03",
    phone: "9111111103",
  },
];

const FALLBACK_SUBJECTS = [
  "Data Structures",
  "Discrete Mathematics",
  "Digital Logic Design",
  "Computer Organization",
];

const upsertAuthUser = async ({ email, password, displayName }) => {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { password, displayName });
    return { user, created: false };
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    const user = await admin.auth().createUser({ email, password, displayName });
    return { user, created: true };
  }
};

const main = async () => {
  const firestore = admin.firestore();
  const now = new Date().toISOString();

  // Subjects for the shared branch/year/semester, from the seeded subject sets
  const subjectSetDoc = await firestore
    .collection("subjectSets")
    .doc(`${BRANCH}_${YEAR}_${SEMESTER}`.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase())
    .get();
  const subjects =
    (subjectSetDoc.exists && (subjectSetDoc.data()?.subjects || [])) || [];
  const subjectList = subjects.length > 0 ? subjects : FALLBACK_SUBJECTS;
  console.log(
    `Subject set for ${BRANCH} / ${YEAR} / Sem ${SEMESTER}: ${subjectList.length} subject(s) ${subjectSetDoc.exists ? "(from Firestore)" : "(fallback list)"}\n`,
  );

  // ---------- 1 Admin ----------
  {
    const { user, created } = await upsertAuthUser({
      email: ADMIN_ACCOUNT.email,
      password: ADMIN_ACCOUNT.password,
      displayName: ADMIN_ACCOUNT.name,
    });
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    await firestore.collection("admins").doc(user.uid).set(
      {
        uid: user.uid,
        name: ADMIN_ACCOUNT.name,
        email: ADMIN_ACCOUNT.email,
        createdAt: now,
      },
      { merge: true },
    );
    await firestore.collection("users").doc(user.uid).set(
      {
        uid: user.uid,
        name: ADMIN_ACCOUNT.name,
        email: ADMIN_ACCOUNT.email,
        role: "admin",
        createdAt: now,
      },
      { merge: true },
    );
    console.log(`Admin   ${created ? "created" : "updated"}: ${ADMIN_ACCOUNT.email}`);
  }

  // ---------- 3 Teachers ----------
  for (const teacher of TEACHERS) {
    const loginId = `${teacher.teacherId.toLowerCase()}@campusconnect.teacher`;
    const authEmail = loginId;
    const teacherSubjects = subjectList.slice(0, 2);

    const { user, created } = await upsertAuthUser({
      email: authEmail,
      password: teacher.password,
      displayName: teacher.name,
    });
    await admin.auth().setCustomUserClaims(user.uid, { teacher: true });

    const assignments = [
      {
        branch: BRANCH,
        year: YEAR,
        semester: SEMESTER,
        subjects: teacherSubjects,
      },
    ];

    await firestore.collection("teachers").doc(user.uid).set(
      {
        uid: user.uid,
        name: teacher.name,
        fullName: teacher.name,
        displayName: teacher.name,
        email: authEmail,
        jobProfile: teacher.jobProfile,
        employeeId: teacher.teacherId,
        teacherId: teacher.teacherId,
        loginId,
        authEmail,
        contactEmail: "",
        mobile: teacher.mobile,
        phone: teacher.mobile,
        dept: BRANCH,
        department: BRANCH,
        assignments,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
    console.log(
      `Teacher ${created ? "created" : "updated"}: ${teacher.teacherId} (${teacher.name}) — subjects: ${teacherSubjects.join(", ")}`,
    );
  }

  // ---------- 3 Students ----------
  for (const student of STUDENTS) {
    const authEmail = `${student.prn.toLowerCase()}@campusconnect.student`;

    const { user, created } = await upsertAuthUser({
      email: authEmail,
      password: student.password,
      displayName: student.name,
    });

    const studentPayload = {
      uid: user.uid,
      name: student.name,
      email: authEmail,
      loginId: student.prn,
      prn: student.prn,
      rollNo: student.prn,
      rollNumber: student.prn,
      phone: student.phone,
      mobile: student.phone,
      dept: BRANCH,
      department: BRANCH,
      year: YEAR,
      semester: SEMESTER,
      subjects: subjectList,
      role: "Student",
      contactEmail: "",
      onboardingSource: "demo_script",
      createdAt: now,
    };

    await firestore
      .collection("users")
      .doc(user.uid)
      .set(studentPayload, { merge: true });
    await firestore
      .collection("students")
      .doc(user.uid)
      .set(studentPayload, { merge: true });
    console.log(
      `Student ${created ? "created" : "updated"}: ${student.prn} (${student.name})`,
    );
  }

  console.log("\nAll demo accounts ready.");
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Demo account creation failed:", error);
    process.exit(1);
  });
