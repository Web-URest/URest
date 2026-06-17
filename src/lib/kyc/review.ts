/**
 * KYC review-lifecycle writes + the NEEDS_INFO checklist model (PRODUCT_FLOWS
 * §5.1, ADR-007). The ONLY place `KycSubmission.status` moves on the admin path
 * and the ONLY place `KycDocument.purgeAfter` is set (rule 2). Like
 * `lib/listing/review.ts`, the mutating functions are OPERATION BUILDERS — they
 * return un-awaited `Prisma.PrismaPromise`s so the admin coordinator composes
 * them with the listing write + audit row into one `$transaction` (AC#4).
 */
import { KycStatus, Prisma } from "@prisma/client";
import type { KycSubmission } from "@prisma/client";

import { prisma } from "@/lib/db";

/**
 * The itemized NEEDS_INFO checklist (PRODUCT_FLOWS §5.1). Stable keys — the
 * human labels are i18n (`messages/*.json` → ListingApprovalQueue.items.*), so
 * the admin picker, the host to-do, and the notification all read one source.
 */
export const NEEDS_INFO_ITEM_KEYS = [
  "THAI_ID_UNCLEAR", // บัตรประชาชนไม่ชัด / ถ่ายใหม่
  "RIGHT_TO_RENT_DOC", // เอกสารสิทธิ์/โฉนด
  "RENTAL_CONSENT", // สัญญาเช่า + หนังสือยินยอมให้ปล่อยเช่าช่วง
  "SELFIE_WITH_ID", // เซลฟี่คู่บัตร
  "REMAP_PIN", // ปักหมุดแผนที่ใหม่
  "MORE_PHOTOS", // รูปที่พักเพิ่มเติม
  "BANK_NAME_MISMATCH", // ชื่อบัญชีธนาคารไม่ตรงกับบัตร
] as const;

export type NeedsInfoItemKey = (typeof NEEDS_INFO_ITEM_KEYS)[number];

/** One checklist row, persisted to `KycSubmission.needsInfoItems` (JSON array). */
export interface NeedsInfoItem {
  item: NeedsInfoItemKey;
  note?: string;
  satisfied: boolean;
}

const KEY_SET = new Set<string>(NEEDS_INFO_ITEM_KEYS);

/**
 * Defensive parse of the `needsInfoItems` JSON column into typed rows. Anything
 * malformed (null, non-array, unknown key, wrong shape) is dropped, so callers
 * never index into untyped JSON (`noUncheckedIndexedAccess` safe).
 */
export function parseNeedsInfoItems(
  raw: Prisma.JsonValue | null | undefined,
): NeedsInfoItem[] {
  if (!Array.isArray(raw)) return [];
  const out: NeedsInfoItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.item !== "string" || !KEY_SET.has(rec.item)) continue;
    const item = rec.item as NeedsInfoItemKey;
    const satisfied = rec.satisfied === true;
    if (typeof rec.note === "string") {
      out.push({ item, note: rec.note, satisfied });
    } else {
      out.push({ item, satisfied });
    }
  }
  return out;
}

/** Resubmit gate: at least one item and every item satisfied (PRODUCT_FLOWS §5.1). */
export function allItemsSatisfied(items: NeedsInfoItem[]): boolean {
  return items.length > 0 && items.every((i) => i.satisfied);
}

/** PENDING_REVIEW → APPROVED; clears any stale checklist. */
export function approveKycOp(
  submissionId: string,
  adminId: string,
  at: Date,
): Prisma.PrismaPromise<KycSubmission> {
  return prisma.kycSubmission.update({
    where: { id: submissionId },
    data: {
      status: KycStatus.APPROVED,
      reviewedByAdminId: adminId,
      reviewedAt: at,
      needsInfoItems: Prisma.DbNull,
    },
  });
}

/** PENDING_REVIEW → REJECTED. */
export function rejectKycOp(
  submissionId: string,
  adminId: string,
  at: Date,
): Prisma.PrismaPromise<KycSubmission> {
  return prisma.kycSubmission.update({
    where: { id: submissionId },
    data: { status: KycStatus.REJECTED, reviewedByAdminId: adminId, reviewedAt: at },
  });
}

/** PENDING_REVIEW → NEEDS_INFO, persisting the itemized checklist. */
export function needsInfoKycOp(
  submissionId: string,
  adminId: string,
  items: NeedsInfoItem[],
  at: Date,
): Prisma.PrismaPromise<KycSubmission> {
  return prisma.kycSubmission.update({
    where: { id: submissionId },
    data: {
      status: KycStatus.NEEDS_INFO,
      reviewedByAdminId: adminId,
      reviewedAt: at,
      needsInfoItems: items as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Mark every document for a rejected submission for purge (now + 90 days,
 * ADR-007). The purge cron (#35) deletes the R2 object + row when due.
 */
export function purgeDocumentsOp(
  submissionId: string,
  purgeAfter: Date,
): Prisma.PrismaPromise<Prisma.BatchPayload> {
  return prisma.kycDocument.updateMany({
    where: { submissionId },
    data: { purgeAfter },
  });
}

/** NEEDS_INFO → PENDING_REVIEW on host resubmit; clears the satisfied checklist. */
export function resubmitKycOp(submissionId: string): Prisma.PrismaPromise<KycSubmission> {
  return prisma.kycSubmission.update({
    where: { id: submissionId },
    data: { status: KycStatus.PENDING_REVIEW, needsInfoItems: Prisma.DbNull },
  });
}
