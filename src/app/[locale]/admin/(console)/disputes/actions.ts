"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/lib/admin/auth";
import { finalizeDisputeRefund, resolveAppealCase, resolveDisputeCase } from "@/lib/admin/dispute-review";
import type { DisputeResolution } from "@/lib/booking/transitions";
import { redirect } from "@/i18n/navigation";

/**
 * Admin dispute decision actions (§5.3, issue #26). Each re-guards with
 * requireAdmin() and delegates to the coordinator (which owns notify; the money +
 * audit live in lib/booking). Used with `.bind(null, bookingId)`.
 */

/**
 * Parse + VALIDATE the decision. A money decision gets no silent fallback: an
 * unknown `kind` or a non-finite/out-of-range `refundPct` is rejected up front,
 * not coerced to the host-favorable RELEASED or carried into the transaction as NaN.
 */
function parseResolution(fd: FormData): DisputeResolution {
  const kind = String(fd.get("kind"));
  if (kind === "RELEASED") return { kind: "RELEASED" };
  if (kind === "REFUNDED") return { kind: "REFUNDED" };
  if (kind === "PARTIAL") {
    const refundPct = Number(fd.get("refundPct"));
    if (!Number.isFinite(refundPct) || refundPct < 0 || refundPct > 100) {
      throw new Error(`Invalid dispute refundPct: ${String(fd.get("refundPct"))}`);
    }
    return { kind: "PARTIAL", refundPct };
  }
  throw new Error(`Invalid dispute resolution kind: ${kind}`);
}

async function backToQueue(): Promise<void> {
  revalidatePath("/admin/disputes");
  const locale = await getLocale();
  redirect({ href: "/admin/disputes", locale });
}

export async function resolveDisputeAction(bookingId: string, fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await resolveDisputeCase(admin, bookingId, parseResolution(fd));
  await backToQueue();
}

export async function resolveAppealAction(bookingId: string, fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await resolveAppealCase(admin, bookingId, parseResolution(fd));
  await backToQueue();
}

/** Send the guest's refund once the dispute is final (§5.3) — see finalizeDisputeRefund. */
export async function finalizeRefundAction(bookingId: string, _fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await finalizeDisputeRefund(admin, bookingId);
  revalidatePath("/admin/disputes");
  revalidatePath(`/admin/disputes/${bookingId}`);
}
