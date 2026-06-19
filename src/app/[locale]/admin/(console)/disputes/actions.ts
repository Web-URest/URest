"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/lib/admin/auth";
import { resolveAppealCase, resolveDisputeCase } from "@/lib/admin/dispute-review";
import type { DisputeResolution } from "@/lib/booking/transitions";
import { redirect } from "@/i18n/navigation";

/**
 * Admin dispute decision actions (§5.3, issue #26). Each re-guards with
 * requireAdmin() and delegates to the coordinator (which owns notify; the money +
 * audit live in lib/booking). Used with `.bind(null, bookingId)`.
 */

function parseResolution(fd: FormData): DisputeResolution {
  const kind = String(fd.get("kind"));
  if (kind === "PARTIAL") {
    return { kind: "PARTIAL", refundPct: Math.max(0, Math.min(100, Number(fd.get("refundPct") ?? 0))) };
  }
  if (kind === "REFUNDED") return { kind: "REFUNDED" };
  return { kind: "RELEASED" };
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
