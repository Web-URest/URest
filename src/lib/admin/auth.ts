import { cookies } from "next/headers";

import { decryptField } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

import { verifyPassword } from "./password";
import { signAdminSession, verifyAdminSession } from "./session";
import { verifyTotp } from "./totp";

/**
 * Admin authentication (ADR-007/010). The admin surface is structurally
 * disconnected from consumer auth: a separate login route, a separate cookie,
 * and password + TOTP. Admins are `User` rows with `role = ADMIN` (merged from
 * the old AdminUser table), but `getAdmin`/`requireAdmin` reach them ONLY via the
 * admin cookie + a `role = ADMIN` check — never `auth()` / the consumer session —
 * so a consumer session is useless on /admin by construction. The
 * `user_admin_requires_credentials` CHECK keeps a bare role-flip un-loginable.
 *
 * `requireAdmin` is the DAL guard: call it inside every admin page AND every
 * admin server action. Layouts are NOT a security boundary (server actions
 * don't run layouts), mirroring the verification-ladder guards in lib/auth.
 */

export const ADMIN_COOKIE = "admin_session";
const SESSION_MAX_AGE_S = 8 * 60 * 60; // mirrors the signed token TTL

export type AdminPrincipal = {
  id: string;
  email: string;
  displayName: string;
};

export type LoginResult = { ok: true } | { ok: false };

export class AdminAuthError extends Error {
  constructor() {
    super("ADMIN_UNAUTHENTICATED");
    this.name = "AdminAuthError";
  }
}

/**
 * Verify email + password + TOTP. Returns a deliberately generic failure (never
 * revealing which factor failed); only a fully successful login is audited.
 */
export async function loginAdmin(
  email: string,
  password: string,
  token: string,
): Promise<LoginResult> {
  const admin = await prisma.user.findUnique({ where: { email } });
  // role gate: only role=ADMIN rows can log in here; a consumer row never can.
  if (!admin || admin.role !== "ADMIN" || admin.suspendedAt) return { ok: false };
  if (!admin.passwordHash) return { ok: false }; // nullable now; ADMIN rows always set it
  if (!(await verifyPassword(password, admin.passwordHash))) return { ok: false };
  if (!admin.totpSecretEnc) return { ok: false };
  if (!verifyTotp(decryptField(admin.totpSecretEnc), token)) return { ok: false };

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "ADMIN_LOGIN",
      targetType: "User",
      targetId: admin.id,
    },
  });

  const store = await cookies();
  store.set(ADMIN_COOKIE, signAdminSession(admin.id), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return { ok: true };
}

/** Current admin principal, or null. Re-reads the row so suspend is immediate. */
export async function getAdmin(): Promise<AdminPrincipal | null> {
  const raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!raw) return null;

  const verified = verifyAdminSession(raw);
  if (!verified) return null;

  const admin = await prisma.user.findUnique({
    where: { id: verified.adminId },
  });
  // Re-check role + not-suspended every request: demotion/disable is immediate.
  // `!admin.email` also narrows email to string (ADMIN rows always carry one).
  if (!admin || admin.role !== "ADMIN" || admin.suspendedAt || !admin.email) {
    return null;
  }

  return { id: admin.id, email: admin.email, displayName: admin.displayName };
}

/** DAL guard — call in every admin page and server action. */
export async function requireAdmin(): Promise<AdminPrincipal> {
  const admin = await getAdmin();
  if (!admin) throw new AdminAuthError();
  return admin;
}

export async function logoutAdmin(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}
