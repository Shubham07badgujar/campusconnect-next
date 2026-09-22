// Process-level error handling.
//
// WHY: nothing was listening for `unhandledRejection` or `uncaughtException`.
// Since Node 15 an unhandled promise rejection terminates the process by
// default, so a single forgotten `.catch()` anywhere — a fire-and-forget
// attendance rollup, a scheduler tick, an email send — could take the whole
// service down mid-lecture, and the only record would be a Render restart with
// no explanation attached to it.
import { logger, reportError, newRequestId } from "./logger";

const INSTALLED_KEY = Symbol.for("campusconnect.process-error-handlers");

/**
 * Attaches the handlers once per process.
 *
 * Idempotent, and deliberately guarded on globalThis rather than a module-level
 * boolean: server.ts runs through tsx while the Next runtime is compiled
 * separately, so this module is instantiated twice in one process and a local
 * flag would let the handlers be registered twice (two alerts per fault, and a
 * MaxListenersExceededWarning to go with them).
 */
export const installProcessErrorHandlers = (): void => {
  const host = globalThis as unknown as Record<symbol, boolean | undefined>;
  if (host[INSTALLED_KEY]) return;
  host[INSTALLED_KEY] = true;

  // An unhandled rejection is usually a missing `.catch()` on work that was
  // never load-bearing for the current request. Report it loudly, but keep
  // serving: taking the site down mid-lecture is the worse failure.
  process.on("unhandledRejection", (reason) => {
    reportError("Unhandled promise rejection", reason, {
      event: "process.unhandledRejection",
      requestId: newRequestId(),
    });
  });

  // An uncaught exception means an invariant broke somewhere we cannot see.
  // Continuing risks serving wrong data from a half-initialised state, so the
  // default is to report and let the host restart us clean. Set
  // ERROR_EXIT_ON_UNCAUGHT=false to keep the process up instead.
  process.on("uncaughtException", (error) => {
    reportError("Uncaught exception", error, {
      event: "process.uncaughtException",
      requestId: newRequestId(),
    });

    const shouldExit =
      String(process.env.ERROR_EXIT_ON_UNCAUGHT || "true").trim().toLowerCase() !==
      "false";
    if (!shouldExit) return;

    logger.error("Exiting after uncaught exception", {
      event: "process.exit",
    });
    // A moment for the log line and the alert webhook to actually leave.
    setTimeout(() => process.exit(1), 1000).unref();
  });

  logger.info("Process error handlers installed", {
    event: "process.handlers.installed",
  });
};
