/**
 * Per-listing FAQ entries (PRODUCT_FLOWS §4.1 FAQ section, §4.4 edit).
 *
 * Host-authored Q&A served to น้องเรสต์ via `get_listing_details` (Phase 4) — every
 * entry shrinks the AI's "ไม่มีข้อมูล" rate (§5.7 growth loop). Admin-suggested
 * entries (`source: ADMIN_SUGGESTED`) come from the unanswered-questions queue and
 * land as DRAFT fill-ins; the host publishes them here. Ownership re-checked on
 * every write.
 */

import type { ListingFaqEntry } from "@prisma/client";
import { FaqSource, FaqStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

import { ListingError } from "./transitions";

async function assertOwnsListing(listingId: string, hostId: string): Promise<void> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { hostId: true },
  });
  if (!listing) throw new ListingError("NOT_FOUND");
  if (listing.hostId !== hostId) throw new ListingError("NOT_OWNER");
}

/** Load a FAQ entry whose listing is owned by `hostId`, or throw. */
async function loadOwnedFaq(faqId: string, hostId: string): Promise<ListingFaqEntry> {
  const faq = await prisma.listingFaqEntry.findUnique({
    where: { id: faqId },
    include: { listing: { select: { hostId: true } } },
  });
  if (!faq) throw new ListingError("NOT_FOUND");
  if (faq.listing.hostId !== hostId) throw new ListingError("NOT_OWNER");
  return faq;
}

/** All FAQ entries for the host's listing (every status), display order. */
export async function getHostFaqEntries(
  listingId: string,
  hostId: string,
): Promise<ListingFaqEntry[]> {
  await assertOwnsListing(listingId, hostId);
  return prisma.listingFaqEntry.findMany({
    where: { listingId },
    orderBy: { sortOrder: "asc" },
  });
}

/** Create a host-authored entry (PUBLISHED by default), appended to the end. */
export async function createFaqEntry(
  listingId: string,
  hostId: string,
  input: { question: string; answer: string },
): Promise<ListingFaqEntry> {
  await assertOwnsListing(listingId, hostId);
  const last = await prisma.listingFaqEntry.findFirst({
    where: { listingId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return prisma.listingFaqEntry.create({
    data: {
      listingId,
      question: input.question,
      answer: input.answer,
      source: FaqSource.HOST,
      status: FaqStatus.PUBLISHED,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
}

/** Edit an entry's question/answer. */
export async function updateFaqEntry(
  faqId: string,
  hostId: string,
  input: { question: string; answer: string },
): Promise<ListingFaqEntry> {
  await loadOwnedFaq(faqId, hostId);
  return prisma.listingFaqEntry.update({
    where: { id: faqId },
    data: { question: input.question, answer: input.answer },
  });
}

/** Toggle an entry between DRAFT and PUBLISHED. */
export async function setFaqStatus(
  faqId: string,
  hostId: string,
  status: FaqStatus,
): Promise<ListingFaqEntry> {
  await loadOwnedFaq(faqId, hostId);
  return prisma.listingFaqEntry.update({ where: { id: faqId }, data: { status } });
}

/** Delete an entry. */
export async function deleteFaqEntry(faqId: string, hostId: string): Promise<void> {
  await loadOwnedFaq(faqId, hostId);
  await prisma.listingFaqEntry.delete({ where: { id: faqId } });
}
