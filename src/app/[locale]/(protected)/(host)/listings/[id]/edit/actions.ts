"use server";

import { FaqStatus } from "@prisma/client";

import { AuthError, requireHostEligible } from "@/lib/auth/guards";
import {
  editLocation,
  editOperational,
  editSeasons,
  setBookingMode,
} from "@/lib/listing/edit";
import {
  createFaqEntry,
  deleteFaqEntry,
  setFaqStatus,
  updateFaqEntry,
} from "@/lib/listing/faq";
import { ListingError } from "@/lib/listing/transitions";
import {
  editBasicsSchema,
  editLocationSchema,
  faqEntrySchema,
  step3Schema,
  step4Schema,
  step5Schema,
} from "@/lib/listing/validation";

/**
 * Edit Villa server actions (PRODUCT_FLOWS §4.4). Thin authenticated entry points:
 * resolve the host from the session, re-validate with the section schema, delegate
 * all state changes to `lib/listing` (CLAUDE.md rule 2). Operational sections save
 * in place; the location section re-queues review. Errors come back as `Host.*` keys.
 */

export type ActionResult<T extends object = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function errorKey(e: unknown): string {
  if (e instanceof AuthError) return "errorGeneric";
  if (e instanceof ListingError) {
    switch (e.reason) {
      case "NOT_FOUND":
        return "errorNotFound";
      case "NOT_OWNER":
        return "errorNotOwner";
      case "NOT_EDITABLE":
        return "errorNotEditable";
      case "SEASON_OVERLAP":
        return "errorSeasonOverlap";
      case "INSTANT_ACK_REQUIRED":
        return "errorInstantAck";
      default:
        return "errorGeneric";
    }
  }
  return "errorGeneric";
}

// ── Section saves ────────────────────────────────────────────────────────────

/** ข้อมูลพื้นฐาน (no re-review). */
export async function editBasicsAction(
  listingId: string,
  raw: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireHostEligible();
    const p = editBasicsSchema.safeParse(raw);
    if (!p.success) return { ok: false, error: "errorGeneric" };
    await editOperational(listingId, user.id, {
      title: p.data.title,
      description: p.data.description,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}

/** ตำแหน่งที่ตั้ง (re-review: → PENDING_REVIEW, hidden until re-approved). */
export async function editLocationAction(
  listingId: string,
  raw: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireHostEligible();
    const p = editLocationSchema.safeParse(raw);
    if (!p.success) return { ok: false, error: "errorGeneric" };
    await editLocation(listingId, user.id, {
      address: p.data.address,
      mapLat: p.data.mapLat ?? null,
      mapLng: p.data.mapLng ?? null,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}

/** รายละเอียด & สิ่งอำนวยความสะดวก (no re-review). */
export async function editDetailsAction(
  listingId: string,
  raw: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireHostEligible();
    const p = step3Schema.safeParse(raw);
    if (!p.success) return { ok: false, error: "errorGeneric" };
    await editOperational(listingId, user.id, {
      bedrooms: p.data.bedrooms,
      beds: p.data.beds,
      baths: p.data.baths,
      maxGuests: p.data.maxGuests,
      poolLengthM: p.data.poolLengthM ?? null,
      poolWidthM: p.data.poolWidthM ?? null,
      poolDepthM: p.data.poolDepthM ?? null,
      amenities: p.data.amenities,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}

/** กฎที่พัก (no re-review). */
export async function editRulesAction(
  listingId: string,
  raw: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireHostEligible();
    const p = step4Schema.safeParse(raw);
    if (!p.success) return { ok: false, error: "errorGeneric" };
    await editOperational(listingId, user.id, {
      partyPolicy: p.data.partyPolicy,
      quietHoursStart: p.data.quietHoursStart ?? null,
      quietHoursEnd: p.data.quietHoursEnd ?? null,
      cashDepositSatang: p.data.cashDepositSatang,
      checkInTime: p.data.checkInTime,
      checkOutTime: p.data.checkOutTime,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}

/** ราคา & ซีซั่น + โหมดการจอง (no re-review). Rates, seasons, and mode in one save. */
export async function editPricingAction(
  listingId: string,
  raw: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireHostEligible();
    const p = step5Schema.safeParse(raw);
    if (!p.success) return { ok: false, error: "errorGeneric" };

    // Mode first — it carries the instant-ack gate (may reject before other writes).
    await setBookingMode(listingId, user.id, p.data.bookingMode, p.data.instantAck);
    await editOperational(listingId, user.id, {
      baseWeekdaySatang: p.data.baseWeekdaySatang,
      baseWeekendSatang: p.data.baseWeekendSatang,
      holidaySatang: p.data.holidaySatang ?? null,
      includedGuests: p.data.includedGuests,
      extraGuestFeeSatang: p.data.extraGuestFeeSatang,
      cancellationTier: p.data.cancellationTier,
    });
    await editSeasons(
      listingId,
      user.id,
      p.data.seasons.map((s) => ({
        nameTh: s.nameTh,
        startDate: s.startDate,
        endDate: s.endDate,
        weekdaySatang: s.weekdaySatang,
        weekendSatang: s.weekendSatang,
      })),
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}

// ── FAQ CRUD (§4.1 FAQ section) ──────────────────────────────────────────────

export type FaqRow = {
  id: string;
  question: string;
  answer: string;
  status: FaqStatus;
  source: string;
};

export async function createFaqAction(
  listingId: string,
  raw: unknown,
): Promise<ActionResult<{ entry: FaqRow }>> {
  try {
    const user = await requireHostEligible();
    const p = faqEntrySchema.safeParse(raw);
    if (!p.success) return { ok: false, error: "errorGeneric" };
    const e = await createFaqEntry(listingId, user.id, p.data);
    return {
      ok: true,
      entry: { id: e.id, question: e.question, answer: e.answer, status: e.status, source: e.source },
    };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}

export async function updateFaqAction(
  faqId: string,
  raw: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireHostEligible();
    const p = faqEntrySchema.safeParse(raw);
    if (!p.success) return { ok: false, error: "errorGeneric" };
    await updateFaqEntry(faqId, user.id, p.data);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}

export async function deleteFaqAction(faqId: string): Promise<ActionResult> {
  try {
    const user = await requireHostEligible();
    await deleteFaqEntry(faqId, user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}

export async function toggleFaqStatusAction(
  faqId: string,
  status: FaqStatus,
): Promise<ActionResult> {
  try {
    const user = await requireHostEligible();
    await setFaqStatus(faqId, user.id, status);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}
