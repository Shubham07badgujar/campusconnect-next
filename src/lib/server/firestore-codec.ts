// Lossless JSON encoding for Firestore values.
//
// WHY THIS IS NOT JUST JSON.stringify: Firestore documents hold values that
// JSON has no representation for, and every one of them fails QUIETLY.
//
//   Timestamp          -> {_seconds, _nanoseconds}. Restored naively it comes
//                         back as a plain map, so `createdAt` stops being a
//                         date, every range query on it silently matches
//                         nothing, and ordering breaks.
//   Bytes (Buffer)     -> {"0":12,"1":99,…}. A face descriptor restored that
//                         way is corrupt, and nothing errors.
//   DocumentReference  -> a huge object graph of internal SDK state.
//   GeoPoint           -> a plain map, so geo comparisons stop working.
//   NaN / Infinity     -> null. A real value becomes a different real value.
//   undefined          -> the key vanishes entirely.
//
// A backup that changes the data on the way through is not a backup, so every
// non-primitive is written with an explicit type tag and rebuilt on restore.
import { DocumentReference, GeoPoint, Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

/** Tag key. Chosen to be something no application document would use. */
export const TYPE_TAG = "__fsType";

type Tagged = { [TYPE_TAG]: string } & Record<string, unknown>;

/** Converts one Firestore value into something JSON can hold without loss. */
export const encodeValue = (value: unknown): unknown => {
  if (value === null) return null;
  if (value === undefined) return { [TYPE_TAG]: "undefined" };

  if (typeof value === "number") {
    if (Number.isNaN(value)) return { [TYPE_TAG]: "number", value: "NaN" };
    if (value === Infinity) return { [TYPE_TAG]: "number", value: "Infinity" };
    if (value === -Infinity) return { [TYPE_TAG]: "number", value: "-Infinity" };
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;

  if (value instanceof Timestamp) {
    return {
      [TYPE_TAG]: "timestamp",
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
      // Not read back on restore; purely so a human can read the dump.
      iso: value.toDate().toISOString(),
    };
  }
  if (value instanceof Date) {
    return { [TYPE_TAG]: "date", iso: value.toISOString() };
  }
  if (value instanceof GeoPoint) {
    return {
      [TYPE_TAG]: "geopoint",
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }
  if (value instanceof DocumentReference) {
    return { [TYPE_TAG]: "ref", path: value.path };
  }
  if (Buffer.isBuffer(value)) {
    return { [TYPE_TAG]: "bytes", base64: value.toString("base64") };
  }
  if (value instanceof Uint8Array) {
    return { [TYPE_TAG]: "bytes", base64: Buffer.from(value).toString("base64") };
  }

  if (Array.isArray(value)) return value.map(encodeValue);

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = encodeValue(item);
    }
    // A document that genuinely contains our tag key would be ambiguous on the
    // way back, so wrap it and say what it is.
    if (TYPE_TAG in out) return { [TYPE_TAG]: "map", value: out };
    return out;
  }

  // Firestore cannot store anything else, so reaching here means the dump
  // would be lossy. Fail loudly rather than write a backup that lies.
  throw new Error(`Cannot encode value of type ${typeof value} for backup`);
};

/** Rebuilds a Firestore value from its encoded form. */
export const decodeValue = (value: unknown, firestore?: Firestore): unknown => {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item) => decodeValue(item, firestore));
  if (typeof value !== "object") return value;

  const tagged = value as Tagged;
  const tag = tagged[TYPE_TAG];

  if (typeof tag === "string") {
    switch (tag) {
      case "undefined":
        return undefined;
      case "number": {
        const raw = String(tagged.value);
        if (raw === "NaN") return NaN;
        if (raw === "Infinity") return Infinity;
        if (raw === "-Infinity") return -Infinity;
        return Number(raw);
      }
      case "timestamp":
        return new Timestamp(Number(tagged.seconds), Number(tagged.nanoseconds));
      case "date":
        return new Date(String(tagged.iso));
      case "geopoint":
        return new GeoPoint(Number(tagged.latitude), Number(tagged.longitude));
      case "ref": {
        if (!firestore) {
          throw new Error(
            "A Firestore instance is required to decode a document reference",
          );
        }
        return firestore.doc(String(tagged.path));
      }
      case "bytes":
        return Buffer.from(String(tagged.base64), "base64");
      case "map":
        // An escaped plain object: a real document that happens to use our tag
        // key. Decode its FIELDS without dispatching on the tag again —
        // otherwise the very value we escaped gets read back as a type tag.
        return decodePlainObject(tagged.value as Record<string, unknown>, firestore);
      default:
        throw new Error(`Unknown encoded type "${tag}" in backup`);
    }
  }

  return decodePlainObject(value as Record<string, unknown>, firestore);
};

/** Decodes an object's fields without treating the object itself as tagged. */
const decodePlainObject = (
  value: Record<string, unknown>,
  firestore?: Firestore,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const decoded = decodeValue(item, firestore);
    // An encoded `undefined` means "this key was absent", so keep it absent.
    if (decoded !== undefined) out[key] = decoded;
  }
  return out;
};

/** Encodes a whole document's fields. */
export const encodeDocument = (data: Record<string, unknown>): Record<string, unknown> =>
  encodeValue(data) as Record<string, unknown>;

/** Decodes a whole document's fields. */
export const decodeDocument = (
  data: Record<string, unknown>,
  firestore?: Firestore,
): Record<string, unknown> => decodeValue(data, firestore) as Record<string, unknown>;
