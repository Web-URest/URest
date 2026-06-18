import { execSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

// Apply the eval env defaults (DATABASE_URL→urest_eval + dummy non-secrets) in
// THIS process so the migrate/seed subprocesses inherit them. (setupFiles run in
// workers, not here.) ANTHROPIC_API_KEY is intentionally left to the real env.
import "./setup";

/**
 * Ensure `urest_eval` exists + is migrated + core-seeded before the eval runs
 * (#33). Mirrors e2e/global-setup.ts. The eval-only fixtures (test guest + saved
 * villas) are added idempotently by the runner via seedEvalFixtures().
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "postgresql://urest:urest@localhost:5432/urest_eval";
  const adminUrl = url.replace(/\/urest_eval(\?|$)/, "/postgres$1");

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await admin.$executeRawUnsafe("CREATE DATABASE urest_eval");
  } catch {
    // already exists — fine
  } finally {
    await admin.$disconnect();
  }

  const env = { ...process.env, DATABASE_URL: url };
  execSync("pnpm prisma migrate deploy", { stdio: "inherit", env });
  // The core seed creates the 3 fixture villas + holidays + attractions (dev/test only).
  execSync("pnpm tsx prisma/seed.ts", { stdio: "inherit", env: { ...env, NODE_ENV: "test" } });
}
