import path from "path";

import { defineConfig } from "vitest/config";

/**
 * Golden eval harness (#33) — a SEPARATE suite from `pnpm test`. It makes real
 * Claude Haiku calls against a seeded Postgres (`urest_eval`), so it's slow + paid
 * and runs only via `pnpm eval:concierge` (and the path-filtered CI job). The
 * `evals/**` glob is outside `vitest.config.ts`'s `src/**` include, so unit tests
 * never pick these up.
 */
export default defineConfig({
  test: {
    include: ["evals/**/*.eval.ts"],
    environment: "node",
    globalSetup: ["./evals/global-setup.ts"],
    setupFiles: ["./evals/setup.ts"],
    testTimeout: 60_000, // real model + tool loop per case
    hookTimeout: 180_000, // global-setup migrates + seeds
    fileParallelism: false, // one shared test DB
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
