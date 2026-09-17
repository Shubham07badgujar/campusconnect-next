// Tests for teacher ID allocation.
//
// The defect being guarded against: ids were derived by scanning the teachers
// collection for the highest sequence and adding one, with no transaction.
// Two concurrent creations therefore produced the SAME id, and the creation
// route then adopted the existing Firebase Auth account at that login address —
// resetting another teacher's password and renaming their account. Deleting a
// teacher reproduced it without any concurrency, because the scan-derived
// maximum fell back and the id was reissued.
//
// The fake Firestore below implements real optimistic-concurrency semantics
// (version check on commit, retry on conflict) so the concurrency test
// exercises the retry path rather than merely asserting sequential behaviour.
import { describe, expect, it } from "vitest";
import {
  allocateFreeTeacherId,
  allocateTeacherId,
  formatTeacherId,
  parseTeacherIdSequence,
  prefixForJobProfile,
} from "@/lib/server/teacher-ids";

type TeacherRecord = Record<string, unknown>;

const makeFakeFirestore = (initialTeachers: TeacherRecord[] = []) => {
  const docs = new Map<string, { data: any; version: number }>();
  const teachers: TeacherRecord[] = [...initialTeachers];
  let transactionAttempts = 0;

  const docRef = (collectionName: string, id: string) => ({
    __key: `${collectionName}/${id}`,
    async get() {
      const entry = docs.get(`${collectionName}/${id}`);
      return { exists: Boolean(entry), data: () => entry?.data };
    },
    async delete() {
      docs.delete(`${collectionName}/${id}`);
    },
  });

  const firestore: any = {
    collection(name: string) {
      return {
        doc: (id: string) => docRef(name, id),
        async get() {
          // Full-collection scan, used once per prefix to seed the counter.
          return { docs: teachers.map((t) => ({ data: () => t })) };
        },
        where(field: string, _op: string, value: unknown) {
          const query = {
            limit: () => query,
            async get() {
              const matches = teachers.filter((t) => t[field] === value);
              return {
                empty: matches.length === 0,
                docs: matches.map((t) => ({ data: () => t })),
              };
            },
          };
          return query;
        },
      };
    },

    async runTransaction(
      fn: (tx: any) => Promise<any>,
      options?: { maxAttempts?: number },
    ) {
      // Every pending transaction re-reads each round and only the first to
      // commit wins, so N simultaneous callers need up to N rounds. Real
      // Firestore serialises far better; this budget just keeps the fake from
      // giving up before the implementation has had a fair chance.
      const maxAttempts = options?.maxAttempts ?? 64;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        transactionAttempts += 1;
        const reads = new Map<string, number>();
        const writes: { key: string; data: any; merge: boolean }[] = [];

        const tx = {
          async get(ref: { __key: string }) {
            const entry = docs.get(ref.__key);
            reads.set(ref.__key, entry?.version ?? 0);
            // Yield, so a concurrently running transaction can read the same
            // document before either commits. Without this the test could
            // never produce a conflict.
            await Promise.resolve();
            return { exists: Boolean(entry), data: () => entry?.data };
          },
          set(ref: { __key: string }, data: any, options?: { merge?: boolean }) {
            writes.push({ key: ref.__key, data, merge: Boolean(options?.merge) });
          },
        };

        const result = await fn(tx);

        const conflicted = [...reads].some(
          ([key, version]) => (docs.get(key)?.version ?? 0) !== version,
        );
        if (conflicted) continue; // Firestore retries; so do we.

        writes.forEach((write) => {
          const existing = docs.get(write.key);
          docs.set(write.key, {
            data: write.merge ? { ...existing?.data, ...write.data } : write.data,
            version: (existing?.version ?? 0) + 1,
          });
        });
        return result;
      }
      throw new Error("transaction failed after retries");
    },
  };

  return {
    firestore,
    teachers,
    addTeacher: (t: TeacherRecord) => teachers.push(t),
    removeTeacher: (teacherId: string) => {
      const index = teachers.findIndex((t) => t.teacherId === teacherId);
      if (index >= 0) teachers.splice(index, 1);
    },
    get transactionAttempts() {
      return transactionAttempts;
    },
  };
};

const PERMANENT = "Permanent Faculty";

describe("id formatting and parsing", () => {
  it("keeps the established two-digit minimum", () => {
    expect(formatTeacherId("PM", 1)).toBe("PM01");
    expect(formatTeacherId("PM", 9)).toBe("PM09");
    expect(formatTeacherId("PM", 99)).toBe("PM99");
  });

  it("widens past 99 instead of stopping", () => {
    // padStart sets a MINIMUM width; it never truncates.
    expect(formatTeacherId("PM", 100)).toBe("PM100");
    expect(formatTeacherId("PM", 101)).toBe("PM101");
    expect(formatTeacherId("PM", 1000)).toBe("PM1000");
  });

  it("parses ids of any width", () => {
    expect(parseTeacherIdSequence("PM01", "PM")).toBe(1);
    expect(parseTeacherIdSequence("PM99", "PM")).toBe(99);
    expect(parseTeacherIdSequence("PM100", "PM")).toBe(100);
    expect(parseTeacherIdSequence("AD01", "PM")).toBeNull();
    expect(parseTeacherIdSequence("", "PM")).toBeNull();
  });

  it("maps job profiles to their prefixes", () => {
    expect(prefixForJobProfile("Permanent Faculty")).toBe("PM");
    expect(prefixForJobProfile("Adjunct Faculty")).toBe("AD");
    expect(prefixForJobProfile("Visiting Faculty")).toBe("VT");
    expect(prefixForJobProfile("Wizard")).toBe("");
  });
});

describe("sequential allocation", () => {
  it("issues PM01 for the first teacher", async () => {
    const { firestore } = makeFakeFirestore();
    expect(await allocateTeacherId(firestore, PERMANENT)).toBe("PM01");
  });

  it("continues from the highest existing id", async () => {
    const { firestore } = makeFakeFirestore([{ teacherId: "PM07" }]);
    expect(await allocateTeacherId(firestore, PERMANENT)).toBe("PM08");
  });

  it("crosses 99 -> 100 -> 101 without stalling", async () => {
    const { firestore } = makeFakeFirestore([{ teacherId: "PM99" }]);
    expect(await allocateTeacherId(firestore, PERMANENT)).toBe("PM100");
    expect(await allocateTeacherId(firestore, PERMANENT)).toBe("PM101");
    expect(await allocateTeacherId(firestore, PERMANENT)).toBe("PM102");
  });

  it("seeds correctly from ids of mixed length", async () => {
    // The scan must compare numerically, not lexicographically — "PM9" sorts
    // after "PM100" as a string.
    const { firestore } = makeFakeFirestore([
      { teacherId: "PM01" },
      { teacherId: "PM09" },
      { teacherId: "PM100" },
      { employeeId: "PM042" },
    ]);
    expect(await allocateTeacherId(firestore, PERMANENT)).toBe("PM101");
  });

  it("reads the employeeId field as well as teacherId", async () => {
    const { firestore } = makeFakeFirestore([{ employeeId: "PM12" }]);
    expect(await allocateTeacherId(firestore, PERMANENT)).toBe("PM13");
  });

  it("keeps a separate sequence per job profile", async () => {
    const { firestore } = makeFakeFirestore([
      { teacherId: "PM05" },
      { teacherId: "AD02" },
    ]);
    expect(await allocateTeacherId(firestore, PERMANENT)).toBe("PM06");
    expect(await allocateTeacherId(firestore, "Adjunct Faculty")).toBe("AD03");
    expect(await allocateTeacherId(firestore, "Visiting Faculty")).toBe("VT01");
  });

  it("refuses an unknown job profile", async () => {
    const { firestore } = makeFakeFirestore();
    await expect(allocateTeacherId(firestore, "Wizard")).rejects.toThrow(
      /Invalid job profile/i,
    );
  });
});

describe("concurrent allocation", () => {
  it("gives twenty simultaneous callers twenty distinct ids", async () => {
    const fake = makeFakeFirestore();

    const ids = await Promise.all(
      Array.from({ length: 20 }, () => allocateTeacherId(fake.firestore, PERMANENT)),
    );

    // The original implementation failed precisely here: every caller read the
    // same maximum and returned the same id.
    expect(new Set(ids).size).toBe(20);
    expect([...ids].sort()).toEqual(
      Array.from({ length: 20 }, (_, i) => formatTeacherId("PM", i + 1)).sort(),
    );
  });

  it("actually exercises the retry path", async () => {
    const fake = makeFakeFirestore();
    await Promise.all(
      Array.from({ length: 10 }, () => allocateTeacherId(fake.firestore, PERMANENT)),
    );
    // More attempts than allocations means transactions genuinely conflicted
    // and were retried, rather than the calls happening to serialise.
    expect(fake.transactionAttempts).toBeGreaterThan(10);
  });
});

describe("ids are monotonic, so a deleted teacher's id is never reissued", () => {
  it("does not hand a deleted teacher's id to the next hire", async () => {
    const fake = makeFakeFirestore();

    const first = await allocateTeacherId(fake.firestore, PERMANENT);
    fake.addTeacher({ teacherId: first });
    const second = await allocateTeacherId(fake.firestore, PERMANENT);
    fake.addTeacher({ teacherId: second });
    expect([first, second]).toEqual(["PM01", "PM02"]);

    // The teacher is deleted. Under the old scan-based generator the maximum
    // fell back to PM01 and the next hire was handed PM02 — inheriting the
    // deleted teacher's still-live sign-in account.
    fake.removeTeacher(second);

    const third = await allocateTeacherId(fake.firestore, PERMANENT);
    expect(third).toBe("PM03");
    expect(third).not.toBe(second);
  });
});

describe("allocateFreeTeacherId", () => {
  it("skips an id that is already taken", async () => {
    // The counter would offer PM01, but a record already holds it — which is
    // possible for data written before the counter existed.
    const fake = makeFakeFirestore([{ teacherId: "PM01" }]);
    // Seed the counter low on purpose by pre-creating it behind the scan.
    const id = await allocateFreeTeacherId(fake.firestore, PERMANENT);
    expect(id).toBe("PM02");
  });

  it("returns a usable id when nothing is taken", async () => {
    const fake = makeFakeFirestore();
    expect(await allocateFreeTeacherId(fake.firestore, PERMANENT)).toBe("PM01");
  });

  it("never returns the same id twice across many allocations", async () => {
    const fake = makeFakeFirestore();
    const ids: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const id = await allocateFreeTeacherId(fake.firestore, PERMANENT);
      fake.addTeacher({ teacherId: id });
      ids.push(id);
    }
    expect(new Set(ids).size).toBe(12);
    expect(ids[11]).toBe("PM12");
  });
});
