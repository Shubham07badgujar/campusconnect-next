// Next.js instrumentation hook.
//
// `onRequestError` is called by the framework for every unhandled error thrown
// while rendering a page or running a route handler. That matters because it
// catches the faults nobody wrote a catch block for — exactly the ones that
// used to vanish without trace.
//
// It does NOT fire for a route that catches its own error and returns a 500
// itself, which most of ours do; those call reportError directly. The two
// together are what give a complete picture.
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  // Loaded lazily: instrumentation is evaluated in the edge runtime too, and
  // this module should not drag server-only code in until it is actually used.
  const { reportError, newRequestId } = await import("@/lib/server/logger");

  reportError("Unhandled request error", error, {
    event: "request.error",
    requestId: newRequestId(),
    route: request.path,
    method: request.method,
    // `context` says whether this came from a route handler, a server
    // component render, a server action, and so on — the first thing you want
    // to know when triaging.
    renderSource: context.renderSource,
    routeType: context.routeType,
    routePath: context.routePath,
  });
};

export const register = async () => {
  // Only the Node.js runtime owns the process; the edge runtime has no
  // process-level event emitter to attach to.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { installProcessErrorHandlers } = await import(
    "@/lib/server/process-errors"
  );
  installProcessErrorHandlers();
};
