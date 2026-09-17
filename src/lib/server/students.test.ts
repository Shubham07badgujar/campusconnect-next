// Regression tests for the "student can never be marked present" defect.
//
// The single-student creation path wrote only `users/{uid}` and omitted `prn`
// and `subjects`. Attendance enrolment is decided by studentBelongsToSession(),
// which ends in `studentSubjects.some(...)` — false on an empty array — so every
// student added through the admin UI was silently excluded from every
// attendance session, permanently. Password reset by roll number was broken too,
// because it queries the `students` collection.
//
// The final block below is the one that matters: it feeds a freshly built
// profile to the REAL enrolment function and asserts the student matches.
import { describe, expect, it } from "vitest";
import {
  buildStudentProfile,
  resolveStudentSubjects,
  writeStudentProfile,
  type SubjectSetsMap,
} from "@/lib/server/students";
import { studentBelongsToSession, makeSubjectId } from "@/lib/server/attendance/shared";

const subjectSets: SubjectSetsMap = {
  "Computer Engineering": {
    "2nd": {
      "1": ["Data Structures", "Algorithms", "Computer Networks"],
      "2": ["Database Systems", "Software Engineering"],
    },
  },
};

const validInput = {
  uid: "uid-1",
  name: "  Priya Nair ",
  email: "Priya@Example.com",
  rollNo: " cs201 ",
  dept: "Computer Engineering",
  year: "2nd",
  semester: "1",
  phone: "9876543210",
  contactEmail: "Parent@Example.com",
  onboardingSource: "admin_single",
};

describe("buildStudentProfile", () => {
  it("assigns the subjects for the student's branch, year and semester", () => {
    const result = buildStudentProfile(validInput, subjectSets);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The heart of the bug: this array used to be absent entirely.
    expect(result.profile.subjects).toEqual([
      "Data Structures",
      "Algorithms",
      "Computer Networks",
    ]);
  });

  it("writes every identity alias the app reads elsewhere", () => {
    const result = buildStudentProfile(validInput, subjectSets);
    if (!result.ok) throw new Error("expected ok");

    // prn was missing before, which broke password reset by roll number.
    expect(result.profile.prn).toBe("CS201");
    expect(result.profile.rollNo).toBe("CS201");
    expect(result.profile.rollNumber).toBe("CS201");
    expect(result.profile.loginId).toBe("CS201");
    expect(result.profile.dept).toBe("Computer Engineering");
    expect(result.profile.department).toBe("Computer Engineering");
    expect(result.profile.phone).toBe("9876543210");
    expect(result.profile.mobile).toBe("9876543210");
    expect(result.profile.role).toBe("Student");
  });

  it("normalizes casing and whitespace", () => {
    const result = buildStudentProfile(validInput, subjectSets);
    if (!result.ok) throw new Error("expected ok");

    expect(result.profile.name).toBe("Priya Nair");
    expect(result.profile.email).toBe("priya@example.com");
    expect(result.profile.contactEmail).toBe("parent@example.com");
  });

  it("refuses, loudly, when no subject set is configured", () => {
    const result = buildStudentProfile(
      { ...validInput, year: "4th" }, // no 4th-year set above
      subjectSets,
    );

    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    // The admin must be told why, and what to do about it — silently creating an
    // unmarkable student is the defect this replaces.
    expect(result.errors.join(" ")).toMatch(/No subject set is configured/i);
    expect(result.errors.join(" ")).toMatch(/Subject Sets/i);
  });

  it("reports each missing required field", () => {
    const result = buildStudentProfile(
      {
        uid: "uid-2",
        name: "",
        email: "",
        rollNo: "",
        dept: "",
        year: "",
        semester: "",
        onboardingSource: "admin_single",
      },
      subjectSets,
    );

    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    const joined = result.errors.join(" ");
    expect(joined).toMatch(/Name is required/);
    expect(joined).toMatch(/Email is required/);
    expect(joined).toMatch(/Roll number is required/);
    expect(joined).toMatch(/department/i);
    expect(joined).toMatch(/year/i);
    expect(joined).toMatch(/semester/i);
  });

  it("rejects an unrecognised department rather than storing it raw", () => {
    const result = buildStudentProfile(
      { ...validInput, dept: "Department of Wizardry" },
      subjectSets,
    );
    expect(result.ok).toBe(false);
  });

  it("never returns a successful profile with an empty subject list", () => {
    // The invariant that makes attendance work. If this ever fails, the
    // original defect has returned.
    const cases = [
      validInput,
      { ...validInput, semester: "2" },
      { ...validInput, year: "4th" },
      { ...validInput, dept: "Civil Engineering" },
    ];

    for (const input of cases) {
      const result = buildStudentProfile(input, subjectSets);
      if (result.ok) expect(result.profile.subjects.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveStudentSubjects", () => {
  it("is semester-specific, matching bulk onboarding", () => {
    expect(
      resolveStudentSubjects(subjectSets, "Computer Engineering", "2nd", "2"),
    ).toEqual(["Database Systems", "Software Engineering"]);
  });

  it("returns an empty list for an unconfigured combination", () => {
    expect(
      resolveStudentSubjects(subjectSets, "Computer Engineering", "3rd", "1"),
    ).toEqual([]);
  });
});

describe("writeStudentProfile", () => {
  it("writes BOTH users/{uid} and students/{uid}", async () => {
    const writes: { collection: string; id: string; data: any }[] = [];
    const firestore = {
      collection: (collection: string) => ({
        doc: (id: string) => ({
          set: async (data: any) => {
            writes.push({ collection, id, data });
          },
        }),
      }),
    };

    const built = buildStudentProfile(validInput, subjectSets);
    if (!built.ok) throw new Error("expected ok");
    await writeStudentProfile(firestore, built.profile);

    expect(writes.map((w) => w.collection)).toEqual(["users", "students"]);
    expect(writes.every((w) => w.id === "uid-1")).toBe(true);
    // Both documents must carry subjects — the roster reads one, password
    // reset reads the other.
    expect(writes[0].data.subjects.length).toBeGreaterThan(0);
    expect(writes[1].data.subjects.length).toBeGreaterThan(0);
    expect(writes[1].data.prn).toBe("CS201");
  });
});

// ---------------------------------------------------------------------------
// The test that actually proves the bug is fixed: run the real enrolment check.
// ---------------------------------------------------------------------------
describe("a created student is enrollable in an attendance session", () => {
  const session = {
    branch: "Computer Engineering",
    year: "2nd",
    semester: "1",
    subjectName: "Data Structures",
    subjectId: makeSubjectId("Data Structures"),
  };

  it("matches a session for one of their subjects", () => {
    const built = buildStudentProfile(validInput, subjectSets);
    if (!built.ok) throw new Error("expected ok");

    expect(studentBelongsToSession(built.profile, session)).toBe(true);
  });

  it("reproduces the original defect: no subjects means never enrollable", () => {
    // Exactly what the old route wrote — note the absent `subjects`.
    const legacyProfile = {
      name: "Priya Nair",
      email: "priya@example.com",
      rollNo: "CS201",
      rollNumber: "CS201",
      dept: "Computer Engineering",
      year: "2nd",
      semester: "1",
      role: "Student",
    };

    expect(studentBelongsToSession(legacyProfile, session)).toBe(false);
  });

  it("does not match a session for a subject they do not take", () => {
    const built = buildStudentProfile(validInput, subjectSets);
    if (!built.ok) throw new Error("expected ok");

    expect(
      studentBelongsToSession(built.profile, {
        ...session,
        subjectName: "Database Systems", // semester 2
        subjectId: makeSubjectId("Database Systems"),
      }),
    ).toBe(false);
  });

  it("does not match another branch's session", () => {
    const built = buildStudentProfile(validInput, subjectSets);
    if (!built.ok) throw new Error("expected ok");

    expect(
      studentBelongsToSession(built.profile, {
        ...session,
        branch: "Civil Engineering",
      }),
    ).toBe(false);
  });
});
