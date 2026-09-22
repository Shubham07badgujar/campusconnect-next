// The redaction rules are the security-critical half of the logger: logs get
// pasted into tickets and shipped to third parties, so "did this field get
// scrubbed" is a question that deserves an executable answer rather than a
// careful reading of a regex.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REDACTED,
  __resetAlertStateForTests,
  isPersonalKey,
  isSecretKey,
  logger,
  newRequestId,
  reportError,
  scrub,
  serializeError,
} from "./logger";

let written: string[];
let writeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  written = [];
  writeSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: any) => {
      written.push(String(chunk));
      return true;
    });
  process.env.LOG_FORMAT = "json";
  process.env.LOG_LEVEL = "debug";
  delete process.env.ERROR_ALERT_WEBHOOK_URL;
  __resetAlertStateForTests();
});

afterEach(() => {
  writeSpy.mockRestore();
  vi.unstubAllGlobals();
  delete process.env.LOG_FORMAT;
  delete process.env.LOG_LEVEL;
  delete process.env.ERROR_ALERT_WEBHOOK_URL;
});

const lastRecord = () => JSON.parse(written[written.length - 1]);

// --------------------------------------------------------------- key rules

describe("secret keys", () => {
  it("recognises credentials and auth material in any casing style", () => {
    for (const key of [
      "password",
      "passwordHash",
      "password_hash",
      "PASSWORD-HASH",
      "idToken",
      "refresh_token",
      "authorization",
      "Cookie",
      "apiKey",
      "privateKey",
      "clientSecret",
      "credentialId",
      "passphrase",
    ]) {
      expect(isSecretKey(key), key).toBe(true);
    }
  });

  it("recognises biometric material", () => {
    // The face profile is the most sensitive thing the product stores.
    for (const key of [
      "descriptor",
      "descriptors",
      "faceDescriptors",
      "faceEmbedding",
      "biometricData",
      "faceprint",
    ]) {
      expect(isSecretKey(key), key).toBe(true);
    }
  });

  it("matches short ambiguous tokens only as whole words", () => {
    expect(isSecretKey("otp")).toBe(true);
    expect(isSecretKey("otpHash")).toBe(true);
    expect(isSecretKey("password_salt")).toBe(true);

    // The reason whole-word matching exists: "notPresent" contains the
    // substring "otp". Redacting an attendance roster would be a real bug.
    expect(isSecretKey("notPresent")).toBe(false);
    expect(isSecretKey("totalPresent")).toBe(false);
  });

  it("leaves the identifiers we actually need for support alone", () => {
    for (const key of [
      "uid",
      "sessionId", // attendance session — the key fact when attendance fails
      "teacherId",
      "requestId",
      "route",
      "status",
      "durationMs",
    ]) {
      expect(isSecretKey(key), key).toBe(false);
      expect(isPersonalKey(key), key).toBe(false);
    }
  });
});

describe("personal keys", () => {
  it("recognises contact details and academic identity", () => {
    for (const key of [
      "email",
      "contactEmail",
      "authEmail",
      "mobile",
      "phone",
      "loginId",
      "rollNo",
      "rollNumber",
      "prn",
      "address",
      "ipAddress",
      "photoURL",
      "fullName",
      "displayName",
    ]) {
      expect(isPersonalKey(key), key).toBe(true);
    }
  });
});

// ----------------------------------------------------------------- scrub

describe("scrub", () => {
  it("redacts secrets and personal data at any depth", () => {
    const result: any = scrub({
      uid: "abc123",
      profile: {
        fullName: "Student A",
        email: "a@campusconnect.student",
        mobile: "9000000001",
        nested: { password: "hunter2", teacherId: "PM01" },
      },
    });

    expect(result.uid).toBe("abc123");
    expect(result.profile.fullName).toBe(REDACTED);
    expect(result.profile.email).toBe(REDACTED);
    expect(result.profile.mobile).toBe(REDACTED);
    expect(result.profile.nested.password).toBe(REDACTED);
    expect(result.profile.nested.teacherId).toBe("PM01");
  });

  it("redacts a whole request body without the caller thinking about it", () => {
    // This is the realistic failure mode: someone logs `body` on an error.
    const result: any = scrub({
      body: {
        fullName: "New Student",
        email: "new@campusconnect.student",
        password: "generated-secret",
        rollNo: "CS210",
        dept: "Computer Engineering",
        year: "2nd",
      },
    });

    expect(result.body.password).toBe(REDACTED);
    expect(result.body.email).toBe(REDACTED);
    expect(result.body.rollNo).toBe(REDACTED);
    expect(result.body.fullName).toBe(REDACTED);
    // Non-identifying context survives, which is what makes the log useful.
    expect(result.body.dept).toBe("Computer Engineering");
    expect(result.body.year).toBe("2nd");
  });

  it("breaks cycles instead of hanging", () => {
    const a: any = { name: "a" };
    a.self = a;
    expect(() => scrub(a)).not.toThrow();
    expect((scrub(a) as any).self).toBe("[circular]");
  });

  it("caps long arrays so a face descriptor cannot fill the log", () => {
    const result: any = scrub({ values: Array.from({ length: 200 }, (_, i) => i) });
    expect(result.values.length).toBe(21);
    expect(String(result.values[20])).toContain("180 more of 200");
  });

  it("caps long strings", () => {
    const result: any = scrub({ blob: "x".repeat(5000) });
    expect(result.blob).toContain("[5000 chars]");
    expect(result.blob.length).toBeLessThan(600);
  });

  it("stops at a depth limit", () => {
    let deep: any = "bottom";
    for (let i = 0; i < 20; i += 1) deep = { deep };
    expect(JSON.stringify(scrub(deep))).toContain("[depth limit]");
  });

  it("reports NaN and Infinity instead of silently turning them into null", () => {
    const result: any = scrub({ a: NaN, b: Infinity, c: 1.5 });
    expect(result.a).toBe("NaN");
    expect(result.b).toBe("Infinity");
    expect(result.c).toBe(1.5);
  });
});

// ------------------------------------------------------------ error shape

describe("serializeError", () => {
  it("keeps the Firebase error code, which is usually the actionable part", () => {
    const error = Object.assign(new Error("already exists"), {
      code: "auth/email-already-exists",
    });
    const result = serializeError(error);
    expect(result.name).toBe("Error");
    expect(result.code).toBe("auth/email-already-exists");
    expect(result.stack).toBeTruthy();
  });

  it("handles something that threw a non-Error", () => {
    expect(serializeError("boom")).toEqual({ name: "NonError", message: "boom" });
    expect(serializeError({ weird: true }).name).toBe("NonError");
  });

  it("trims the stack to something readable", () => {
    const error = new Error("deep");
    error.stack = ["Error: deep", ...Array.from({ length: 50 }, (_, i) => `  at f${i}`)].join(
      "\n",
    );
    expect(serializeError(error).stack!.split("\n").length).toBe(12);
  });
});

// ---------------------------------------------------------------- output

describe("log output", () => {
  it("writes one parseable JSON line per event", () => {
    logger.info("attendance session started", {
      requestId: "req-1",
      uid: "teacher-1",
      sessionId: "sess-9",
      event: "attendance.start",
    });

    expect(written.length).toBe(1);
    expect(written[0].endsWith("\n")).toBe(true);
    expect(written[0].trimEnd().includes("\n")).toBe(false);

    const record = lastRecord();
    expect(record.level).toBe("info");
    expect(record.msg).toBe("attendance session started");
    expect(record.uid).toBe("teacher-1");
    expect(record.sessionId).toBe("sess-9");
    expect(typeof record.ts).toBe("string");
  });

  it("respects LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "warn";
    logger.info("quiet");
    logger.debug("quieter");
    expect(written.length).toBe(0);
    logger.error("loud");
    expect(written.length).toBe(1);
  });

  it("scrubs context on the way out, not just when asked", () => {
    logger.error("failed to create student", {
      route: "/api/users",
      body: { email: "a@b.c", password: "secret" },
    });
    const line = written[0];
    expect(line).not.toContain("secret");
    expect(line).not.toContain("a@b.c");
    expect(line).toContain(REDACTED);
  });

  it("gives each request id a distinct value", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newRequestId()));
    expect(ids.size).toBe(200);
  });
});

// --------------------------------------------------------------- alerting

describe("reportError", () => {
  it("logs the error even with no webhook configured", () => {
    reportError("attendance rollup failed", new Error("boom"), {
      route: "/api/attendance/end",
      uid: "teacher-1",
    });
    const record = lastRecord();
    expect(record.level).toBe("error");
    expect(record.err.message).toBe("boom");
    expect(record.route).toBe("/api/attendance/end");
  });

  it("posts to the webhook when one is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    process.env.ERROR_ALERT_WEBHOOK_URL = "https://hooks.example/alert";

    reportError("boom", new Error("kaboom"), { route: "/api/x" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.example/alert");
    expect(JSON.parse(init.body).err.message).toBe("kaboom");
  });

  it("scrubs the alert payload too, because it leaves our infrastructure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    process.env.ERROR_ALERT_WEBHOOK_URL = "https://hooks.example/alert";

    reportError("login failed", new Error("bad"), {
      route: "/api/auth",
      email: "student@example.com",
      idToken: "eyJhbGciOi.secret.value",
    });

    const body = fetchMock.mock.calls[0][1].body;
    expect(body).not.toContain("student@example.com");
    expect(body).not.toContain("eyJhbGciOi.secret.value");
  });

  it("sends one alert per distinct fault, not one per occurrence", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    process.env.ERROR_ALERT_WEBHOOK_URL = "https://hooks.example/alert";

    // A retry storm: the same failure 50 times.
    for (let i = 0; i < 50; i += 1) {
      reportError("rollup failed", new Error("boom"), { route: "/api/attendance/end" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A genuinely different fault still gets through.
    reportError("other", new Error("different"), { route: "/api/users" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caps alerts per window even when every fault is distinct", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    process.env.ERROR_ALERT_WEBHOOK_URL = "https://hooks.example/alert";

    for (let i = 0; i < 100; i += 1) {
      reportError("failed", new Error(`distinct ${i}`), { route: `/api/r${i}` });
    }
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("never throws, even if the webhook itself explodes", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("network down");
      }),
    );
    process.env.ERROR_ALERT_WEBHOOK_URL = "https://hooks.example/alert";

    // Reporting a problem must not be able to cause one.
    expect(() =>
      reportError("boom", new Error("original"), { route: "/api/x" }),
    ).not.toThrow();

    // …and the original error is still logged.
    expect(written.some((line) => line.includes("original"))).toBe(true);
  });
});
