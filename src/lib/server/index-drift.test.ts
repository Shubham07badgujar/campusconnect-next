// `firebase deploy --only firestore` DELETES any composite index missing from
// the indexes file, and on this project a dropped index degrades silently into
// a full collection scan rather than raising an error. So the check that
// catches that has to be right, and its dangerous direction cannot be
// exercised against the real project without creating an index there.
import { describe, expect, it } from "vitest";
import {
  type CompositeIndex,
  describeIndex,
  diffIndexes,
  fingerprintIndex,
} from "./index-drift";

const sessionIndex: CompositeIndex = {
  collectionGroup: "attendance_sessions",
  queryScope: "COLLECTION",
  fields: [
    { fieldPath: "teacherId", order: "ASCENDING" },
    { fieldPath: "startTime", order: "DESCENDING" },
  ],
};

const mappingIndex: CompositeIndex = {
  collectionGroup: "teacherStudentMappings",
  queryScope: "COLLECTION",
  fields: [
    { fieldPath: "teacherUid", order: "ASCENDING" },
    { fieldPath: "subject", order: "ASCENDING" },
  ],
};

describe("fingerprintIndex", () => {
  it("ignores key order and server metadata", () => {
    const a: any = {
      collectionGroup: "students",
      queryScope: "COLLECTION",
      fields: [{ fieldPath: "dept", order: "ASCENDING" }],
    };
    const b: any = {
      fields: [{ order: "ASCENDING", fieldPath: "dept" }],
      queryScope: "COLLECTION",
      collectionGroup: "students",
      name: "projects/x/databases/(default)/collectionGroups/students/indexes/abc",
      state: "READY",
    };
    expect(fingerprintIndex(a)).toBe(fingerprintIndex(b));
  });

  it("treats field ORDER as significant, because Firestore does", () => {
    // (a ASC, b ASC) is a different index from (b ASC, a ASC). Sorting the
    // fields before comparing would silently call these the same and let a
    // real index be deleted.
    const forwards: CompositeIndex = {
      collectionGroup: "x",
      fields: [
        { fieldPath: "a", order: "ASCENDING" },
        { fieldPath: "b", order: "ASCENDING" },
      ],
    };
    const backwards: CompositeIndex = {
      collectionGroup: "x",
      fields: [
        { fieldPath: "b", order: "ASCENDING" },
        { fieldPath: "a", order: "ASCENDING" },
      ],
    };
    expect(fingerprintIndex(forwards)).not.toBe(fingerprintIndex(backwards));
  });

  it("distinguishes sort direction", () => {
    const asc: CompositeIndex = {
      collectionGroup: "x",
      fields: [{ fieldPath: "a", order: "ASCENDING" }],
    };
    const desc: CompositeIndex = {
      collectionGroup: "x",
      fields: [{ fieldPath: "a", order: "DESCENDING" }],
    };
    expect(fingerprintIndex(asc)).not.toBe(fingerprintIndex(desc));
  });

  it("distinguishes an array-contains index from an ordered one", () => {
    const array: CompositeIndex = {
      collectionGroup: "users",
      fields: [{ fieldPath: "subjects", arrayConfig: "CONTAINS" }],
    };
    const ordered: CompositeIndex = {
      collectionGroup: "users",
      fields: [{ fieldPath: "subjects", order: "ASCENDING" }],
    };
    expect(fingerprintIndex(array)).not.toBe(fingerprintIndex(ordered));
  });

  it("distinguishes collection-group scope from collection scope", () => {
    expect(
      fingerprintIndex({ ...sessionIndex, queryScope: "COLLECTION_GROUP" }),
    ).not.toBe(fingerprintIndex(sessionIndex));
  });

  it("defaults a missing queryScope to COLLECTION rather than differing", () => {
    const { queryScope, ...withoutScope } = sessionIndex;
    void queryScope;
    expect(fingerprintIndex(withoutScope as CompositeIndex)).toBe(
      fingerprintIndex(sessionIndex),
    );
  });
});

describe("diffIndexes", () => {
  it("reports in sync when both sides match", () => {
    const result = diffIndexes([sessionIndex], [{ ...sessionIndex }]);
    expect(result.inSync).toBe(true);
    expect(result.wouldBeDeleted).toEqual([]);
    expect(result.notYetDeployed).toEqual([]);
  });

  it("flags an index that a deploy would DELETE", () => {
    // The dangerous case: it exists in production, nobody wrote it down.
    const result = diffIndexes([sessionIndex, mappingIndex], [sessionIndex]);
    expect(result.inSync).toBe(false);
    expect(result.wouldBeDeleted).toHaveLength(1);
    expect(result.wouldBeDeleted[0].collectionGroup).toBe("teacherStudentMappings");
    expect(result.notYetDeployed).toEqual([]);
  });

  it("flags an index that is committed but not yet live", () => {
    const result = diffIndexes([], [sessionIndex]);
    expect(result.inSync).toBe(false);
    expect(result.notYetDeployed).toHaveLength(1);
    expect(result.wouldBeDeleted).toEqual([]);
  });

  it("reports both directions at once", () => {
    const result = diffIndexes([mappingIndex], [sessionIndex]);
    expect(result.wouldBeDeleted).toHaveLength(1);
    expect(result.notYetDeployed).toHaveLength(1);
  });

  it("treats an empty project and an empty file as in sync", () => {
    // This is the current real state, and a deploy must be a no-op.
    expect(diffIndexes([], []).inSync).toBe(true);
  });

  it("notices a reordered index rather than calling it unchanged", () => {
    const reordered: CompositeIndex = {
      ...sessionIndex,
      fields: [...sessionIndex.fields].reverse(),
    };
    const result = diffIndexes([sessionIndex], [reordered]);
    expect(result.wouldBeDeleted).toHaveLength(1);
    expect(result.notYetDeployed).toHaveLength(1);
  });
});

describe("describeIndex", () => {
  it("renders something readable on a bad day", () => {
    expect(describeIndex(sessionIndex)).toBe(
      "attendance_sessions: teacherId ASCENDING, startTime DESCENDING",
    );
  });

  it("renders an array-contains field", () => {
    expect(
      describeIndex({
        collectionGroup: "users",
        fields: [{ fieldPath: "subjects", arrayConfig: "CONTAINS" }],
      }),
    ).toBe("users: subjects CONTAINS");
  });
});
