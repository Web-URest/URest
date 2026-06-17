"use server";

import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/lib/admin/auth";
import {
  approveSubmission,
  rejectSubmission,
  requestNeedsInfo,
  setLegalBadge,
} from "@/lib/admin/listing-review";
import { NEEDS_INFO_ITEM_KEYS, type NeedsInfoItem, type NeedsInfoItemKey } from "@/lib/kyc/review";
import { redirect } from "@/i18n/navigation";
import { revalidatePath } from "next/cache";

/**
 * Admin approval-queue server actions (PRODUCT_FLOWS §5.1, issue #14). Each
 * re-guards with `requireAdmin()` (server actions don't run layouts), delegates
 * the atomic decision to the coordinator, then revalidates + returns to the
 * queue. Used with `.bind(null, …)` so FormData is the trailing arg.
 */

const KEY_SET = new Set<string>(NEEDS_INFO_ITEM_KEYS);

async function backToQueue(): Promise<void> {
  revalidatePath("/admin/approval-queue");
  const locale = await getLocale();
  redirect({ href: "/admin/approval-queue", locale });
}

export async function approveAction(submissionId: string, _fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await approveSubmission(admin, submissionId);
  await backToQueue();
}

export async function rejectAction(submissionId: string, fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const reason = String(fd.get("reason") ?? "");
  await rejectSubmission(admin, submissionId, reason);
  await backToQueue();
}

export async function needsInfoAction(submissionId: string, fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const items: NeedsInfoItem[] = fd
    .getAll("items")
    .map(String)
    .filter((k): k is NeedsInfoItemKey => KEY_SET.has(k))
    .map((item) => {
      const note = String(fd.get(`note:${item}`) ?? "").trim();
      return note ? { item, note, satisfied: false } : { item, satisfied: false };
    });
  await requestNeedsInfo(admin, submissionId, items);
  await backToQueue();
}

export async function legalBadgeAction(
  listingId: string,
  grant: boolean,
  _fd: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  await setLegalBadge(admin, listingId, grant);
  revalidatePath("/admin/approval-queue");
}
