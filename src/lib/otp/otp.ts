import { randomInt } from "node:crypto";

import { hashOtp, verifyOtp } from "@/lib/crypto";
import { prisma } from "@/lib/db";

import { getSmsDriver } from "./sms";

/**
 * Phone-OTP verification ladder, step 2 (PRODUCT_FLOWS §1, ADR-007): a verified
 * phone gates sending booking requests & messages. The gate itself lives in
 * `lib/auth/guards.ts` (`requirePhoneVerified`); this module issues and checks
 * codes.
 *
 * Codes are 6 digits, hashed with a per-row salt (never stored or logged in
 * plaintext — ADR-010 §7); the only place a plaintext code exists is the SMS
 * message handed to the driver. Deadlines are DB columns swept by cron
 * (CLAUDE.md rule 3), never in-process timers.
 */

export const CODE_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60_000; // 10 minutes
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60_000; // 1 minute between sends per user

export type RequestResult =
  | { status: "SENT"; expiresAt: Date }
  | { status: "INVALID_PHONE" }
  | { status: "RATE_LIMITED"; retryAfterMs: number };

export type VerifyResult =
  | { status: "VERIFIED" }
  | { status: "INVALID_CODE"; attemptsRemaining: number }
  | { status: "EXPIRED" }
  | { status: "TOO_MANY_ATTEMPTS" }
  | { status: "NO_ACTIVE_CODE" };

/**
 * Normalize a Thai mobile number to local `0XXXXXXXXX` form, or null if it is
 * not a valid mobile (06/08/09 prefixes). Landlines are rejected — OTP needs SMS.
 */
export function normalizeThaiMobile(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  let local = digits;
  if (local.startsWith("+66")) local = "0" + local.slice(3);
  else if (local.startsWith("66")) local = "0" + local.slice(2);
  return /^0[689]\d{8}$/.test(local) ? local : null;
}

function generateCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH)
    .toString()
    .padStart(CODE_LENGTH, "0");
}

/** Delete a single user's expired/consumed rows — opportunistic cleanup on request. */
function deadRowFilter(userId?: string) {
  const now = new Date();
  return {
    ...(userId ? { userId } : {}),
    OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }],
  };
}

export async function requestPhoneOtp(
  userId: string,
  phoneInput: string,
): Promise<RequestResult> {
  const phone = normalizeThaiMobile(phoneInput);
  if (!phone) return { status: "INVALID_PHONE" };

  // Opportunistic cleanup of this user's dead rows (real purge tied to usage;
  // the global cron tick — ADR-004 — wires `purgeDeadOtps` once a scheduler exists).
  await prisma.phoneOtp.deleteMany({ where: deadRowFilter(userId) });

  // Cooldown: block rapid re-requests.
  const latest = await prisma.phoneOtp.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (latest) {
    const age = Date.now() - latest.createdAt.getTime();
    if (age < RESEND_COOLDOWN_MS) {
      return { status: "RATE_LIMITED", retryAfterMs: RESEND_COOLDOWN_MS - age };
    }
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.phoneOtp.create({
    data: { userId, phone, codeHash: hashOtp(code), expiresAt, attempts: 0 },
  });

  // The code lives only in the outgoing message — never logged here.
  await getSmsDriver().send(
    phone,
    `รหัสยืนยัน U-Rest ของคุณคือ ${code} (หมดอายุใน 10 นาที)`,
  );

  return { status: "SENT", expiresAt };
}

export async function verifyPhoneOtp(
  userId: string,
  code: string,
): Promise<VerifyResult> {
  const row = await prisma.phoneOtp.findFirst({
    where: { userId, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { status: "NO_ACTIVE_CODE" };
  if (row.expiresAt.getTime() < Date.now()) return { status: "EXPIRED" };

  // Atomic increment — concurrent verifies serialize on the row, closing the
  // brute-force TOCTOU window on a 6-digit code (advisor note / acceptance #3).
  const { attempts } = await prisma.phoneOtp.update({
    where: { id: row.id },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  });

  if (attempts > MAX_ATTEMPTS) {
    await consume(row.id);
    return { status: "TOO_MANY_ATTEMPTS" };
  }

  if (verifyOtp(code, row.codeHash)) {
    // Consume the code and mark the phone verified in one transaction.
    await prisma.$transaction([
      prisma.phoneOtp.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { phoneVerifiedAt: new Date(), phone: row.phone },
      }),
    ]);
    return { status: "VERIFIED" };
  }

  // Wrong code.
  if (attempts >= MAX_ATTEMPTS) {
    await consume(row.id);
    return { status: "TOO_MANY_ATTEMPTS" };
  }
  return { status: "INVALID_CODE", attemptsRemaining: MAX_ATTEMPTS - attempts };
}

function consume(id: string) {
  return prisma.phoneOtp.update({
    where: { id },
    data: { consumedAt: new Date() },
  });
}

/**
 * Global sweep of expired/consumed OTP rows (ADR-010 §6 retention; ADR-004
 * idempotent-sweep pattern). Wire into the minute-tick scheduler when it lands
 * (infra lane) — restart-safe because it re-derives work from the DB.
 */
export async function purgeDeadOtps(): Promise<number> {
  const { count } = await prisma.phoneOtp.deleteMany({ where: deadRowFilter() });
  return count;
}
