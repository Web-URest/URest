/**
 * Next.js instrumentation hook — runs once when the server process starts,
 * before the first request is served. Importing `@/lib/env` here makes the
 * standalone server (ADR-002) fail AT BOOT on missing/invalid configuration
 * (issue #9 acceptance: "missing env var fails the boot loudly"), instead of
 * throwing on the first request that happens to read config.
 *
 * `@/lib/env` validates `process.env` with zod at module-eval time and throws
 * on failure (CLAUDE.md rule 4); the dynamic import below triggers that.
 */
export async function register() {
  // Only the Node.js server runtime has the full env; skip the edge runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      await import("@/lib/env");
    } catch (err) {
      // Next catches a thrown register() error as an unhandledRejection and
      // keeps the HTTP listener up — which would let a misconfigured deploy
      // pass Railway's healthcheck and go live. Exit non-zero instead so the
      // boot actually fails (the deploy fails; the previous version stays up).
      console.error(err);
      process.exit(1);
    }

    // Start the in-process cron scheduler (ADR-004). Skip under test so vitest
    // never schedules a live tick.
    if (process.env.NODE_ENV !== "test") {
      const { startScheduler } = await import("@/lib/jobs/scheduler");
      startScheduler();
    }
  }
}
