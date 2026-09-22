// Executable security rules tests, run against the Firestore emulator.
//
// WHY: for the many screens that read Firestore directly from the browser,
// firestore.rules is the ONLY thing deciding what is allowed — there is no
// server code in that path. Until now those rules were hand-pasted into the
// console, never reviewed and never tested.
//
// Run with: npm run test:rules   (starts the emulator around the suite)
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

const STUDENT_A = "student-a";
const STUDENT_B = "student-b";
const TEACHER = "teacher-1";
const ADMIN = "admin-1";

const asStudentA = () => testEnv.authenticatedContext(STUDENT_A).firestore();
const asStudentB = () => testEnv.authenticatedContext(STUDENT_B).firestore();
const asTeacher = () =>
  testEnv.authenticatedContext(TEACHER, { teacher: true }).firestore();
const asAdmin = () => testEnv.authenticatedContext(ADMIN, { admin: true }).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "campusconnect-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed with rules disabled, so fixtures do not depend on the rules under test.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", STUDENT_A), {
      uid: STUDENT_A,
      name: "Student A",
      role: "Student",
      email: "a@campusconnect.student",
      phone: "9000000001",
      rollNo: "CS201",
    });
    await setDoc(doc(db, "users", STUDENT_B), {
      uid: STUDENT_B,
      name: "Student B",
      role: "Student",
      email: "b@campusconnect.student",
      phone: "9000000002",
      rollNo: "CS202",
    });
    await setDoc(doc(db, "students", STUDENT_A), { uid: STUDENT_A, prn: "CS201" });
    await setDoc(doc(db, "teachers", TEACHER), {
      uid: TEACHER,
      name: "Teacher One",
      mobile: "9800000001",
      contactEmail: "teacher@example.com",
      authEmail: "pm01@campusconnect.teacher",
      dept: "Computer Engineering",
    });
    await setDoc(doc(db, "chats", "chat-1"), {
      studentId: STUDENT_A,
      teacherId: TEACHER,
    });
    await setDoc(doc(db, "messages", "msg-1"), {
      chatId: "chat-1",
      senderId: STUDENT_A,
      receiverId: TEACHER,
      message: "hello",
      read: false,
    });
    await setDoc(doc(db, "announcements", "ann-1"), {
      title: "Notice",
      message: "Body",
      active: true,
      readBy: [],
    });
  });
});

// ---------------------------------------------------------------- users

describe("users — personal data is not campus-wide", () => {
  it("lets a student read their own record", async () => {
    await assertSucceeds(getDoc(doc(asStudentA(), "users", STUDENT_A)));
  });

  it("stops a student reading another student's record", async () => {
    // This is the finding: `users` mirrors every student's name, email, phone
    // and roll number, and was readable by any signed-in account — which
    // nullified the stricter rule on `students`.
    await assertFails(getDoc(doc(asStudentA(), "users", STUDENT_B)));
  });

  it("stops a student listing the whole user directory", async () => {
    await assertFails(getDocs(collection(asStudentA(), "users")));
  });

  it("lets staff read any user, because the admin and teacher screens need it", async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), "users", STUDENT_A)));
    await assertSucceeds(getDoc(doc(asAdmin(), "users", STUDENT_B)));
    await assertSucceeds(getDocs(collection(asAdmin(), "users")));
  });

  it("refuses an unauthenticated reader entirely", async () => {
    await assertFails(getDoc(doc(asAnon(), "users", STUDENT_A)));
  });

  it("stops a student editing another student", async () => {
    await assertFails(
      updateDoc(doc(asStudentA(), "users", STUDENT_B), { name: "hacked" }),
    );
  });

  it("lets a student edit their own safe fields but not their academic identity", async () => {
    await assertSucceeds(
      updateDoc(doc(asStudentA(), "users", STUDENT_A), { name: "New Name" }),
    );
    // Role, roll number, department, year and semester decide what a student
    // can see and which class they are marked present in.
    await assertFails(
      updateDoc(doc(asStudentA(), "users", STUDENT_A), { role: "Admin" }),
    );
    await assertFails(
      updateDoc(doc(asStudentA(), "users", STUDENT_A), { rollNo: "CS999" }),
    );
    await assertFails(
      updateDoc(doc(asStudentA(), "users", STUDENT_A), { year: "4th" }),
    );
  });
});

// ------------------------------------------------------------- students

describe("students — already correctly scoped", () => {
  it("lets the student and staff read it, and nobody else", async () => {
    await assertSucceeds(getDoc(doc(asStudentA(), "students", STUDENT_A)));
    await assertSucceeds(getDoc(doc(asTeacher(), "students", STUDENT_A)));
    await assertFails(getDoc(doc(asStudentB(), "students", STUDENT_A)));
  });

  it("is not writable by the student themselves", async () => {
    await assertFails(
      updateDoc(doc(asStudentA(), "students", STUDENT_A), { prn: "CS999" }),
    );
  });
});

// -------------------------------------------------------------- chats

describe("chats and messages — participants only", () => {
  it("lets a participant read their conversation", async () => {
    await assertSucceeds(getDoc(doc(asStudentA(), "chats", "chat-1")));
    await assertSucceeds(getDoc(doc(asTeacher(), "chats", "chat-1")));
  });

  it("stops an unrelated student reading a conversation", async () => {
    await assertFails(getDoc(doc(asStudentB(), "chats", "chat-1")));
  });

  it("stops an unrelated student reading its messages", async () => {
    await assertFails(getDoc(doc(asStudentB(), "messages", "msg-1")));
  });

  it("stops a student sending a message as someone else", async () => {
    await assertFails(
      setDoc(doc(asStudentB(), "messages", "forged"), {
        chatId: "chat-1",
        senderId: STUDENT_A, // forged
        receiverId: TEACHER,
        message: "not from me",
      }),
    );
  });
});

// ------------------------------------------------------- announcements

describe("announcements — readable campus-wide, writable by admin", () => {
  it("lets any signed-in user read", async () => {
    await assertSucceeds(getDoc(doc(asStudentA(), "announcements", "ann-1")));
  });

  it("stops a student creating or deleting one", async () => {
    await assertFails(
      setDoc(doc(asStudentA(), "announcements", "ann-2"), { title: "fake" }),
    );
  });

  it("still lets a student mark one as read", async () => {
    await assertSucceeds(
      updateDoc(doc(asStudentA(), "announcements", "ann-1"), {
        readBy: [STUDENT_A],
      }),
    );
  });

  it("stops a student editing the announcement text under cover of readBy", async () => {
    await assertFails(
      updateDoc(doc(asStudentA(), "announcements", "ann-1"), {
        readBy: [STUDENT_A],
        message: "defaced",
      }),
    );
  });
});

// ------------------------------------------------ server-only collections

describe("server-only collections stay closed to the browser", () => {
  it("denies attendance and biometric collections to every client", async () => {
    for (const path of [
      "attendance_sessions",
      "attendance_records",
      "student_faces",
      "student_passkeys",
      "password_reset_otps",
      "teacherStudentMappings",
    ]) {
      await assertFails(getDoc(doc(asStudentA(), path, "any")));
      await assertFails(getDoc(doc(asTeacher(), path, "any")));
      // Even an admin goes through the guarded API for these, never directly.
      await assertFails(getDoc(doc(asAdmin(), path, "any")));
    }
  });
});
