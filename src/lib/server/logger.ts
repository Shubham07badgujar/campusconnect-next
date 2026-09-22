// Structured server-side logging and error reporting.
//
// WHY THIS EXISTS: until now the entire logging strategy was ~220 bare
// console.log / console.error calls, and nothing at all watched for errors.
// When the college rings to say attendance failed this morning, there was
// nothing to look at: no request id to correlate, no uid, no stack, and no
// alert that anything had gone wrong in the first place. Support was guesswork.
//
// Three deliberate design choices:
//
//  1. ONE LINE OF JSON PER EVENT, to stdout. Render (and every other host)
//     captures stdout into its log stream, so this needs no service, no
//     account and no spend to be useful immediately. It also means the logs
//     are greppable and machine-parseable the day someone does wire up a
//     collector.
//
//  2. REDACTION IS NOT OPTIONAL. Logs get copied into tickets, pasted into
//     chat and shipped to third parties. This module scrubs by KEY NAME
//     before anything is written, so a caller cannot leak a password, an ID
//     token, a face descriptor or a student's phone number by carelessly
//     passing a whole request body. Denying by pattern means a field added
//     later is covered without anyone remembering to update this file.
//
//  3. ALERTS ARE RATE LIMITED. A loop that fails 10,000 times must not send
//     10,000 webhooks; the second incident would be the alerting bill.
//
// Wiring an external collector later (Sentry and friends) is additive: point
// ERROR_ALERT_WEBHOOK_URL at it, or call reportError from that SDK too.

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export const REDACTED = "[redacted]";

// Matching is done two ways, because one way is wrong in both directions.
//
// Long distinctive tokens are matched as SUBSTRINGS of the key with separators
// stripped, so `passwordHash`, `password_hash` and `PASSWORD-HASH` all hit the
// same rule without needing to be listed three times.
//
// Short tokens are matched as WHOLE WORDS instead, because a substring test on
// them fires on innocent keys: "notPresent" contains "otp", and an attendance
// roster that quietly logged as [redacted] would be worse than useless.
const SECRET_SUBSTRINGS = [
  "password", "passwd", "passphrase", "token", "secret", "credential",
  "authorization", "authheader", "cookie", "apikey", "privatekey",
  "challenge", "publickey", "descriptor", "embedding", "biometric",
  "faceprint",
];
const SECRET_WORDS = ["otp", "salt", "pin", "jwt", "sid"];

// Personal data that is not needed to diagnose a fault. A uid identifies the
// person for support purposes without putting their contact details in a log
// line, so that is what we keep instead.
const PERSONAL_SUBSTRINGS = [
  "email", "mobile", "phone", "contactnumber", "loginid", "rollno",
  "rollnumber", "address", "dateofbirth", "photourl", "fullname",
  "displayname",
];
const PERSONAL_WORDS = ["prn", "dob"];

// KNOWN LIMITATION, deliberate: a bare `name` key is NOT redacted. It is the
// field name used by Error, by uploaded files and by collections, so redacting
// it would blank out the most useful part of most error reports. The student
// and teacher records use `fullName` / `displayName`, which are covered. The
// rule this leaves for callers: log a uid, never a whole document.

const normalizeKey = (key: string) => key.replace(/[^a-z0-9]/gi, "").toLowerCase();

/** Splits camelCase, snake_case and kebab-case alike: "otpHash" -> [otp, hash]. */
const keyWords = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

const matches = (key: string, substrings: string[], words: string[]) => {
  const normalized = normalizeKey(key);
  if (substrings.some((token) => normalized.includes(token))) return true;
  const parts = keyWords(key);
  return words.some((token) => parts.includes(token));
};

export const isSecretKey = (key: string) =>
  matches(key, SECRET_SUBSTRINGS, SECRET_WORDS);
export const isPersonalKey = (key: string) =>
  matches(key, PERSONAL_SUBSTRINGS, PERSONAL_WORDS);

// Caps. A log line that is megabytes long is its own outage: it can fill a
// disk, get truncated in the middle of the JSON, or cost real money to ship.
// Face descriptors in particular are long float arrays.
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 512;
const MAX_LINE_BYTES = 16 * 1024;

/**
 * Recursively copies a value into something safe to serialize: secrets and
 * personal fields replaced, depth and size bounded, cycles broken.
 *
 * Exported because the redaction rules are the security-critical part of this
 * module and are tested directly.
 */
export const scrub = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[${value.length} chars]`
      : value;
  }
  if (typeof value === "number") {
    // JSON has no NaN or Infinity; JSON.stringify turns them into null, which
    // silently misreports the value. Say what it actually was.
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") return "[function]";
  if (typeof value === "symbol") return value.toString();

  if (value instanceof Error) return serializeError(value);
  if (value instanceof Date) return value.toISOString();

  if (depth >= MAX_DEPTH) return "[depth limit]";

  if (typeof value === "object") {
    if (seen.has(value as object)) return "[circular]";
    seen.add(value as object);

    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => scrub(item, depth + 1, seen));
      if (value.length > MAX_ARRAY_ITEMS) {
        items.push(`…[${value.length - MAX_ARRAY_ITEMS} more of ${value.length}]`);
      }
      return items;
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(key) || isPersonalKey(key)) {
        // Record that something was there — "the body had a password field"
        // is useful; its value never is.
        out[key] = REDACTED;
        continue;
      }
      out[key] = scrub(item, depth + 1, seen);
    }
    return out;
  }

  return String(value);
};

export type SerializedError = {
  name: string;
  message: string;
  /** Firebase and Node both use `code`, and it is usually the actionable part. */
  code?: string;
  stack?: string;
  cause?: unknown;
};

export const serializeError = (error: unknown): SerializedError => {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      name: error.name,
      message: String(error.message).slice(0, MAX_STRING_LENGTH),
      ...(code === undefined ? {} : { code: String(code) }),
      // Enough frames to locate the fault, not the whole novel.
      ...(error.stack
        ? { stack: error.stack.split("\n").slice(0, 12).join("\n") }
        : {}),
      ...((error as { cause?: unknown }).cause
        ? { cause: scrub((error as { cause?: unknown }).cause, MAX_DEPTH - 2) }
        : {}),
    };
  }
  // Something threw a non-Error. Say so rather than printing "[object Object]".
  return { name: "NonError", message: String(scrub(error)) };
};

export type LogContext = Record<string, unknown> & {
  /** Correlates every line emitted while handling one request. */
  requestId?: string;
  /** Who was acting. The safe way to identify a person in a log line. */
  uid?: string;
  route?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  event?: string;
};

const minLevel = (): number => {
  const configured = String(process.env.LOG_LEVEL || "").trim().toLowerCase();
  if (configured in LEVEL_ORDER) return LEVEL_ORDER[configured as LogLevel];
  return process.env.NODE_ENV === "production" ? LEVEL_ORDER.info : LEVEL_ORDER.debug;
};

const useJson = (): boolean => {
  const configured = String(process.env.LOG_FORMAT || "").trim().toLowerCase();
  if (configured === "json") return true;
  if (configured === "pretty") return false;
  // Pretty for a human at a terminal; JSON everywhere a machine reads it.
  return process.env.NODE_ENV === "production";
};

const write = (line: string) => {
  const capped =
    Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES
      ? `${line.slice(0, MAX_LINE_BYTES)}…[truncated]`
      : line;
  // process.stdout rather than console.log: this module must keep working even
  // if something else in the process has replaced the console.
  process.stdout.write(`${capped}\n`);
};

const emit = (level: LogLevel, message: string, context?: LogContext) => {
  if (LEVEL_ORDER[level] < minLevel()) return;

  const scrubbed = (context ? scrub(context) : {}) as Record<string, unknown>;
  const record = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...scrubbed,
  };

  if (useJson()) {
    write(JSON.stringify(record));
    return;
  }

  const { ts, level: _l, msg, ...rest } = record;
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  write(`${ts} ${level.toUpperCase().padEnd(5)} ${msg}${extra}`);
};

/** Short, unique enough to correlate the lines of one request. */
export const newRequestId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};

// ---------------------------------------------------------------- alerting
//
// Module-level state has to live on globalThis. server.ts runs through tsx
// while the Next route handlers are compiled separately, so the two are
// SEPARATE module instances inside one process — a plain module-level counter
// would be duplicated, and each copy would get its own allowance. Same pattern
// as firebase-admin.ts and keep-alive.ts.
type AlertState = { windowStartedAt: number; sent: number; seen: Map<string, number> };

const ALERT_STATE_KEY = Symbol.for("campusconnect.error-alert-state");

const alertState = (): AlertState => {
  const host = globalThis as unknown as Record<symbol, AlertState | undefined>;
  if (!host[ALERT_STATE_KEY]) {
    host[ALERT_STATE_KEY] = { windowStartedAt: Date.now(), sent: 0, seen: new Map() };
  }
  return host[ALERT_STATE_KEY]!;
};

const ALERT_WINDOW_MS = 5 * 60 * 1000;
const MAX_ALERTS_PER_WINDOW = 10;
/** One alert per distinct fault per window; repeats are counted, not resent. */
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

/** Groups repeats of the same fault so a retry storm is one alert, not thousands. */
const fingerprint = (error: SerializedError, context?: LogContext) =>
  [context?.route || "", error.name, error.code || "", error.message]
    .join("|")
    .slice(0, 300);

const shouldSendAlert = (key: string): boolean => {
  const state = alertState();
  const now = Date.now();

  if (now - state.windowStartedAt > ALERT_WINDOW_MS) {
    state.windowStartedAt = now;
    state.sent = 0;
  }
  for (const [seenKey, at] of state.seen) {
    if (now - at > DEDUPE_WINDOW_MS) state.seen.delete(seenKey);
  }

  if (state.seen.has(key)) return false;
  if (state.sent >= MAX_ALERTS_PER_WINDOW) return false;

  state.seen.set(key, now);
  state.sent += 1;
  return true;
};

/**
 * Records a server-side fault: always logs it, and raises an alert if an
 * ERROR_ALERT_WEBHOOK_URL is configured.
 *
 * Deliberately never throws and never returns a promise the caller has to
 * await — reporting a problem must not be able to cause one, and must not add
 * latency to the request that failed.
 */
export const reportError = (
  message: string,
  error: unknown,
  context?: LogContext,
): void => {
  const serialized = serializeError(error);
  logger.error(message, { ...context, err: serialized });

  const url = String(process.env.ERROR_ALERT_WEBHOOK_URL || "").trim();
  if (!url) return;

  try {
    if (!shouldSendAlert(fingerprint(serialized, context))) return;

    const payload = {
      // `text` is what Slack, Discord and Google Chat all render, so one
      // payload shape works with the common destinations.
      text:
        `🚨 CampusConnect: ${message}\n` +
        `${serialized.name}: ${serialized.message}` +
        `${serialized.code ? ` (${serialized.code})` : ""}\n` +
        `route=${context?.route || "-"} requestId=${context?.requestId || "-"}`,
      service: "campusconnect",
      environment: process.env.NODE_ENV || "development",
      message,
      err: serialized,
      // Scrubbed like any other log context — an alert leaves our infrastructure.
      context: scrub(context ?? {}),
    };

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    }).catch((alertError) => {
      // Never recurse back into reportError from here.
      logger.warn("Error alert webhook failed", {
        event: "alert.failed",
        err: serializeError(alertError),
      });
    });
  } catch (alertError) {
    logger.warn("Error alert could not be dispatched", {
      event: "alert.failed",
      err: serializeError(alertError),
    });
  }
};

/** Test seam: clears the alert window so cases do not affect each other. */
export const __resetAlertStateForTests = () => {
  const host = globalThis as unknown as Record<symbol, AlertState | undefined>;
  host[ALERT_STATE_KEY] = { windowStartedAt: Date.now(), sent: 0, seen: new Map() };
};
