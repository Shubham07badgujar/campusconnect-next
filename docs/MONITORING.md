# Logging and error monitoring

Status as of 2026-09-22: **server-side logging and alerting are in place.**
Client-side error reporting is not — see [Gaps](#gaps).

---

## Why this exists

The entire logging strategy used to be ~220 bare `console.log` / `console.error`
calls, and nothing at all watched for errors. When the college rings to say
attendance failed this morning, there was nothing to look at: no way to tie
lines together, no idea who was affected, and no notification that anything had
gone wrong in the first place. Support was guesswork.

Worse, several `catch` blocks swallowed errors entirely, and **nothing was
listening for `unhandledRejection`** — which since Node 15 terminates the
process by default. A single forgotten `.catch()` could take the service down
mid-lecture and leave no explanation behind.

---

## How it works

Everything goes through `src/lib/server/logger.ts`, which writes **one line of
JSON per event to stdout**. Render captures stdout into its log stream, so this
is useful immediately with no service, no account and no spend.

```json
{"ts":"2026-09-22T06:18:31.731Z","level":"error","msg":"Failed to create student",
 "route":"/api/users","uid":"aBc123","err":{"name":"Error","code":"auth/email-already-exists",
 "message":"…","stack":"…"}}
```

| Field | Meaning |
|---|---|
| `requestId` | ties together every line emitted while handling one request |
| `uid` | who was acting — the safe way to identify a person in a log |
| `route`, `method`, `status`, `durationMs` | request context |
| `event` | a stable machine-readable name, e.g. `attendance.start` |
| `err` | `name`, `message`, Firebase `code`, and a stack trimmed to 12 frames |

### What gets captured

| Source | Mechanism |
|---|---|
| Unhandled errors in route handlers and rendering | `src/instrumentation.ts` → `onRequestError` |
| Errors a route catches itself | `reportError(...)` in the `catch` block |
| Socket.IO handler failures | `reportError(...)` in `src/server/socket.ts` |
| Unhandled promise rejections | `src/lib/server/process-errors.ts` — reported, process kept alive |
| Uncaught exceptions | reported, then exit(1) so the host restarts clean |

The two error paths are complementary: `onRequestError` catches the faults
nobody wrote a `catch` for, and `reportError` covers the routes that handle
their own errors and return a 500 themselves — which most of ours do.

---

## Redaction is not optional

Logs get copied into tickets, pasted into chat and shipped to third parties, so
`logger.ts` scrubs **by key name** before anything is written. A caller cannot
leak a secret by carelessly passing a whole request body.

| Category | Examples | Result |
|---|---|---|
| Credentials | `password`, `passwordHash`, `idToken`, `authorization`, `cookie`, `apiKey`, `privateKey`, `otp` | `[redacted]` |
| Biometrics | `descriptor`, `descriptors`, `faceEmbedding`, `challenge` | `[redacted]` |
| Personal data | `email`, `mobile`, `phone`, `loginId`, `rollNo`, `prn`, `address`, `fullName`, `displayName` | `[redacted]` |
| Useful, kept | `uid`, `sessionId`, `teacherId`, `route`, `status`, `dept`, `year` | kept |

Matching is deliberately done two ways. Long distinctive tokens match as
substrings, so `passwordHash` / `password_hash` / `PASSWORD-HASH` all hit one
rule. Short tokens match as **whole words**, because a substring test on them
fires on innocent keys — `notPresent` contains "otp", and an attendance roster
logged as `[redacted]` would be worse than useless.

Values are also bounded: strings to 512 chars, arrays to 20 items, depth to 6,
and the whole line to 16 KB. A log line that is megabytes long is its own
outage.

**Known limitation, deliberate:** a bare `name` key is *not* redacted, because
it is the field name used by `Error`, uploaded files and collections, and
blanking it would remove the most useful part of most error reports. The
records use `fullName` / `displayName`, which are covered. The rule for
callers: **log a uid, never a whole document.**

The redaction rules have their own unit tests (`logger.test.ts`) — "did this
field get scrubbed" deserves an executable answer rather than a careful reading
of a regex.

---

## Alerts

Set `ERROR_ALERT_WEBHOOK_URL` and every reported server error also POSTs a JSON
alert. A Slack, Discord or Google Chat incoming webhook works unchanged — all
three render the `text` field.

```
ERROR_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Safeguards, all tested:

- The payload is **scrubbed like any other log**, because it leaves our
  infrastructure.
- **Deduplicated** per distinct fault (route + error name + code + message) for
  30 minutes, so a retry storm is one alert rather than thousands.
- **Capped at 10 alerts per 5 minutes** even when every fault is distinct.
- **Never throws and never blocks the request.** Reporting a problem must not be
  able to cause one.

Leave it unset and everything still works — the errors are in the logs either
way.

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `LOG_LEVEL` | `info` in production, `debug` locally | minimum level to emit |
| `LOG_FORMAT` | `json` in production, `pretty` locally | one-line JSON, or human-readable |
| `ERROR_ALERT_WEBHOOK_URL` | unset | where to POST alerts |
| `ERROR_EXIT_ON_UNCAUGHT` | `true` | exit after an uncaught exception so the host restarts clean |

---

## Triaging an incident

1. **Get the `requestId`** from the alert, then grep the logs for it — that is
   every line from the failing request.
2. **Check `err.code` first.** Firebase's code (`auth/email-already-exists`,
   `permission-denied`, `failed-precondition`) is usually the whole answer.
   `failed-precondition` on a query almost always means a **missing composite
   index**.
3. **Check `uid`** to identify who was affected without needing PII in the log.
4. **`event`** names are stable — `attendance.*`, `socket.*`,
   `firebaseAdmin.credential*` — so they are safe to build filters on.

---

## Gaps

- **No client-side error reporting.** A React crash in the browser still shows
  the user a blank screen and tells us nothing. This matters because attendance
  is used on phones in lecture halls. Doing it properly needs an authenticated,
  rate-limited ingest endpoint; doing it badly creates an open write endpoint,
  so it was left out rather than half-done.
- **No log retention beyond the host's own.** Render's free plan keeps very
  little. A collector (or simply shipping stdout somewhere) is the next step,
  and `ERROR_ALERT_WEBHOOK_URL` is the seam to hang it on.
- **No request-duration or status-code metrics.** The fields exist in the log
  shape; nothing aggregates them yet.
