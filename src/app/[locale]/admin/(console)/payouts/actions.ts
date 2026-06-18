"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { markPaid, placeHold, releaseHold, revealAccountNumber } from "@/lib/admin/payout";

/**
 * Admin payout server actions (PRODUCT_FLOWS §5.2, issue #25). Each re-guards
 * with `requireAdmin()` (server actions don't run layouts) and delegates to the
 * `lib/admin/payout` coordinator, then revalidates the due list. `revealAccount`
 * returns data to a client component (the decryption is audited in the lib).
 */

export async function markPaidAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await markPaid(admin, String(fd.get("bookingId")), String(fd.get("slipRef") ?? ""));
  revalidatePath("/admin/payouts");
}

export async function placeHoldAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const reason = String(fd.get("reason") ?? "");
  const hostUserId = fd.get("hostUserId");
  const target = hostUserId ? { hostUserId: String(hostUserId) } : { bookingId: String(fd.get("bookingId")) };
  await placeHold(admin, target, reason);
  revalidatePath("/admin/payouts");
}

export async function releaseHoldAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await releaseHold(admin, String(fd.get("holdId")));
  revalidatePath("/admin/payouts");
}

export type RevealResult =
  | { ok: true; accountNumber: string; bankCode: string; accountName: string }
  | { ok: false };

/** Audited single decryption — returns the number to the client reveal component. */
export async function revealAccountAction(payoutAccountId: string): Promise<RevealResult> {
  const admin = await requireAdmin();
  try {
    const revealed = await revealAccountNumber(admin, payoutAccountId);
    return { ok: true, ...revealed };
  } catch {
    return { ok: false };
  }
}
