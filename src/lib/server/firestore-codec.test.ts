// "An untested backup is not a backup." The claim this codec makes is that a
// document survives the round trip unchanged, so that is what gets asserted —
// including every type that plain JSON would corrupt without complaining.
import { describe, expect, it } from "vitest";
import { GeoPoint, Timestamp } from "firebase-admin/firestore";
import {
  TYPE_TAG,
  decodeDocument,
  decodeValue,
  encodeDocument,
  encodeValue,
} from "./firestore-codec";

/** Encode, serialize, parse, decode — exactly what a backup file does. */
const roundTrip = (value: unknown) =>
  decodeValue(JSON.parse(JSON.stringify(encodeValue(value))));

describe("primitives", () => {
  it("survives unchanged", () => {
    for (const value of ["", "hello", 0, -1, 3.14, true, false, null]) {
      expect(roundTrip(value)).toEqual(value);
    }
  });

  it("keeps NaN and Infinity, which JSON turns into null", () => {
    expect(Number.isNaN(roundTrip(NaN) as number)).toBe(true);
    expect(roundTrip(Infinity)).toBe(Infinity);
    expect(roundTrip(-Infinity)).toBe(-Infinity);

    // The failure this guards against:
    expect(JSON.parse(JSON.stringify({ n: NaN })).n).toBe(null);
  });
});

describe("Timestamp", () => {
  it("comes back as a Timestamp, not a plain map", () => {
    const original = Timestamp.fromDate(new Date("2026-09-22T06:30:00.000Z"));
    const result = roundTrip(original);

    expect(result).toBeInstanceOf(Timestamp);
    expect((result as Timestamp).isEqual(original)).toBe(true);
  });

  it("keeps sub-second precision", () => {
    const original = new Timestamp(1_758_500_000, 123_456_789);
    const result = roundTrip(original) as Timestamp;
    expect(result.seconds).toBe(1_758_500_000);
    expect(result.nanoseconds).toBe(123_456_789);
  });

  it("writes a readable ISO string alongside, for humans reading the dump", () => {
    const encoded: any = encodeValue(Timestamp.fromDate(new Date("2026-01-02T03:04:05Z")));
    expect(encoded.iso).toBe("2026-01-02T03:04:05.000Z");
  });
});

describe("other Firestore types", () => {
  it("round-trips a GeoPoint", () => {
    // Attendance geofencing stores these.
    const original = new GeoPoint(20.9042, 74.7749);
    const result = roundTrip(original) as GeoPoint;
    expect(result).toBeInstanceOf(GeoPoint);
    expect(result.latitude).toBeCloseTo(20.9042, 10);
    expect(result.longitude).toBeCloseTo(74.7749, 10);
  });

  it("round-trips bytes without corrupting them", () => {
    // A face descriptor is the realistic case: naive JSON turns a Buffer into
    // {"0":1,"1":2,...} and restores garbage silently.
    const original = Buffer.from([0, 1, 127, 128, 255, 42]);
    const result = roundTrip(original) as Buffer;
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.equals(original)).toBe(true);

    expect(Array.isArray(JSON.parse(JSON.stringify(original)))).toBe(false);
  });

  it("round-trips a Date", () => {
    const original = new Date("2026-09-22T00:00:00.000Z");
    expect((roundTrip(original) as Date).toISOString()).toBe(original.toISOString());
  });

  it("encodes a document reference by path and needs a Firestore to rebuild it", () => {
    const fakeRef = { path: "students/abc123" };
    // Encoding uses instanceof, so exercise the decode side directly.
    const encoded = { [TYPE_TAG]: "ref", path: fakeRef.path };
    const doc = (p: string) => ({ path: p });
    const result: any = decodeValue(encoded, { doc } as any);
    expect(result.path).toBe("students/abc123");

    expect(() => decodeValue(encoded)).toThrow(/Firestore instance is required/);
  });
});

describe("structures", () => {
  it("round-trips a realistic student document", () => {
    const original = {
      uid: "student-a",
      prn: "CS201",
      subjects: ["Data Structures", "Algorithms"],
      createdAt: Timestamp.fromDate(new Date("2026-09-12T10:00:00Z")),
      profile: {
        year: "2nd",
        semester: "1",
        nested: { deep: { deeper: [1, 2, { flag: true }] } },
      },
      attendancePercent: 78.5,
    };

    const result = decodeDocument(
      JSON.parse(JSON.stringify(encodeDocument(original))),
    );

    expect(result.uid).toBe("student-a");
    expect(result.subjects).toEqual(["Data Structures", "Algorithms"]);
    expect(result.createdAt).toBeInstanceOf(Timestamp);
    expect((result.createdAt as Timestamp).isEqual(original.createdAt)).toBe(true);
    expect(result.profile).toEqual(original.profile);
  });

  it("round-trips an empty document and empty containers", () => {
    expect(decodeDocument(encodeDocument({}))).toEqual({});
    expect(roundTrip([])).toEqual([]);
    expect(roundTrip({})).toEqual({});
  });

  it("keeps timestamps nested inside arrays and maps", () => {
    const stamp = Timestamp.fromDate(new Date("2026-05-01T00:00:00Z"));
    const result: any = roundTrip({ items: [{ at: stamp }], map: { at: stamp } });
    expect(result.items[0].at).toBeInstanceOf(Timestamp);
    expect(result.map.at).toBeInstanceOf(Timestamp);
  });

  it("does not confuse a document that happens to use the tag key", () => {
    const original = { [TYPE_TAG]: "not really a tag", other: 1 };
    expect(roundTrip(original)).toEqual(original);
  });

  it("treats an explicitly undefined field as absent, as Firestore does", () => {
    const result = decodeDocument(
      JSON.parse(JSON.stringify(encodeDocument({ a: 1, b: undefined }))),
    );
    expect(result).toEqual({ a: 1 });
    expect("b" in result).toBe(false);
  });
});

describe("failure behaviour", () => {
  it("refuses to encode something Firestore could not have stored", () => {
    // Better a loud failure than a backup that quietly lost a field.
    expect(() => encodeValue(() => {})).toThrow(/Cannot encode/);
    expect(() => encodeValue(Symbol("x"))).toThrow(/Cannot encode/);
  });

  it("refuses to decode a tag it does not recognise", () => {
    // A backup written by a newer version must not be silently half-restored.
    expect(() => decodeValue({ [TYPE_TAG]: "quantum" })).toThrow(/Unknown encoded type/);
  });
});
