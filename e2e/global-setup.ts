import { execSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

/**
 * Ensure the `urest_e2e` database exists and is migrated before the suite runs.
 * Local: creates the DB (CREATE fails harmlessly if it exists). CI: the Postgres
 * service already created it via POSTGRES_DB, so CREATE no-ops. Then `migrate
 * deploy` applies every migration incl. the hand-written GiST/CHECK constraints.
 */
export default async function globalSetup(): Promise<void> {
  const e2eUrl = process.env.DATABASE_URL ?? "postgresql://urest:urest@localhost:5432/urest_e2e";
  const adminUrl = e2eUrl.replace(/\/urest_e2e(\?|$)/, "/postgres$1");

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await admin.$executeRawUnsafe("CREATE DATABASE urest_e2e");
  } catch {
    // already exists — fine
  } finally {
    await admin.$disconnect();
  }

  execSync("pnpm prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: e2eUrl } });
}
