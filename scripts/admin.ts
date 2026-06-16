/**
 * Admin management script (ADR-007/010): the ONLY way an AdminUser is created —
 * there is no self-signup surface. Creates the row with an argon2id password
 * hash and an AES-256-GCM-encrypted TOTP secret, then prints an `otpauth://`
 * enrollment URI to add to an authenticator app.
 *
 * Usage (run in a trusted shell):
 *   ADMIN_INIT_PASSWORD='…' pnpm admin:create --email a@urest.local --name "ชื่อ"
 *
 * - Password comes from ADMIN_INIT_PASSWORD (env, not argv — argv leaks via shell
 *   history / `ps`). Unset it afterwards.
 * - The TOTP secret is GENERATED here (never supplied) and printed once inside
 *   the otpauth URI for enrollment. Treat that output as a secret.
 *
 * These imports are alias-free (no `@/…`) so `tsx` runs the script without
 * tsconfig-path resolution; Prisma loads .env (DATABASE_URL, DATA_ENCRYPTION_KEY).
 */
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/lib/admin/password";
import { generateTotpSecret, totpAuthUri } from "../src/lib/admin/totp";
import { encryptField } from "../src/lib/crypto";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email");
  const displayName = arg("name") ?? arg("display-name");
  const password = process.env.ADMIN_INIT_PASSWORD;

  if (!email || !displayName) {
    throw new Error(
      'Usage: ADMIN_INIT_PASSWORD="…" pnpm admin:create --email <email> --name <displayName>',
    );
  }
  if (!password || password.length < 12) {
    throw new Error("Set ADMIN_INIT_PASSWORD (≥12 chars) in the environment.");
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    throw new Error(`An AdminUser with email ${email} already exists.`);
  }

  const totpSecret = generateTotpSecret();
  const admin = await prisma.adminUser.create({
    data: {
      email,
      displayName,
      passwordHash: await hashPassword(password),
      totpSecretEnc: encryptField(totpSecret),
    },
  });

  console.log(`\n✅ Created AdminUser ${admin.email} (${admin.id})`);
  console.log("\nEnroll this in an authenticator app (Google Authenticator / Authy):");
  console.log(`\n  ${totpAuthUri(totpSecret, email)}\n`);
  console.log("⚠️  The URI above contains the TOTP secret — it is shown ONCE.");
  console.log("⚠️  Unset ADMIN_INIT_PASSWORD from your shell now.\n");
}

main()
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
