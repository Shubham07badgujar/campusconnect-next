// Comparing declared Firestore indexes against live ones.
//
// Extracted from scripts/checkFirestoreIndexes.ts so the comparison can be
// tested directly. The dangerous direction — an index that exists in
// production but not in the committed file, which a deploy would DELETE —
// cannot be reproduced against the real project without creating an index
// there, so it is proven here instead.

export type IndexField = {
  fieldPath: string;
  order?: string;
  arrayConfig?: string;
};

export type CompositeIndex = {
  collectionGroup: string;
  queryScope?: string;
  fields: IndexField[];
};

/**
 * Reduces an index to a stable string so two descriptions of the same index
 * compare equal regardless of key order or server-assigned metadata.
 *
 * Field ORDER is significant in a composite index — (a ASC, b DESC) is a
 * different index from (b DESC, a ASC) — so it is preserved, not sorted.
 */
export const fingerprintIndex = (index: CompositeIndex): string =>
  [
    index.collectionGroup,
    index.queryScope || "COLLECTION",
    index.fields
      .map((f) => [f.fieldPath, f.order || "", f.arrayConfig || ""].join(":"))
      .join(","),
  ].join("|");

export type IndexDiff = {
  /** In production but not committed: a deploy would DELETE these. */
  wouldBeDeleted: CompositeIndex[];
  /** Committed but not in production: deploy pending, or still building. */
  notYetDeployed: CompositeIndex[];
  inSync: boolean;
};

export const diffIndexes = (
  live: CompositeIndex[],
  declared: CompositeIndex[],
): IndexDiff => {
  const liveByKey = new Map(live.map((i) => [fingerprintIndex(i), i]));
  const declaredByKey = new Map(declared.map((i) => [fingerprintIndex(i), i]));

  const wouldBeDeleted = [...liveByKey.entries()]
    .filter(([key]) => !declaredByKey.has(key))
    .map(([, index]) => index);

  const notYetDeployed = [...declaredByKey.entries()]
    .filter(([key]) => !liveByKey.has(key))
    .map(([, index]) => index);

  return {
    wouldBeDeleted,
    notYetDeployed,
    inSync: wouldBeDeleted.length === 0 && notYetDeployed.length === 0,
  };
};

/** One-line human description, used in both the script output and errors. */
export const describeIndex = (index: CompositeIndex): string =>
  `${index.collectionGroup}: ` +
  index.fields
    .map((f) => `${f.fieldPath} ${f.order || f.arrayConfig || ""}`.trim())
    .join(", ");
