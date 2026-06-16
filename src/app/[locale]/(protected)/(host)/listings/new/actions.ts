"use server";

import { ListingStatus } from "@prisma/client";

import { AuthError, requireHostEligible } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import {
  createDraft,
  ListingError,
  replaceSeasons,
  submitForReview,
  updateDraft,
  type ListingDraftPatch,
} from "@/lib/listing/transitions";
import { storePhoto } from "@/lib/listing/upload";
import {
  step1Schema,
  step3Schema,
  step4Schema,
  step5Schema,
} from "@/lib/listing/validation";

/**
 * Server actions for the listing wizard (PRODUCT_FLOWS §4.1). Thin, authenticated
 * entry points: every action resolves the host from the session (`requireHostEligible`
 * = ladder step 2), re-validates input with the step schema, and delegates all
 * state changes to `lib/listing` (CLAUDE.md rule 2). Errors come back as i18n keys
 * the client maps to `Wizard.*` copy.
 */

export type ActionResult<T extends object = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** Map a thrown domain/auth error to a `Wizard.*` i18n key. */
function errorKey(e: unknown): string {
  if (e instanceof AuthError) {
    return e.reason === "PHONE_UNVERIFIED"
      ? "errorPhoneUnverified"
      : "errorGeneric";
  }
  if (e instanceof ListingError) {
    switch (e.reason) {
      case "INCOMPLETE":
        return "errorIncomplete";
      case "INSUFFICIENT_PHOTOS":
        return "errorInsufficientPhotos";
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

/** Assert the listing exists, belongs to the host, and is still a DRAFT. */
async function assertOwnedDraft(listingId: string, hostId: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (
    !listing ||
    listing.hostId !== hostId ||
    listing.status !== ListingStatus.DRAFT
  ) {
    throw new ListingError("NOT_FOUND");
  }
  return listing;
}

/** Step ① first save: create the DRAFT and apply its basics. */
export async function createDraftAction(
  raw: unknown,
): Promise<ActionResult<{ listingId: string }>> {
  try {
    const user = await requireHostEligible();
    const parsed = step1Schema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errorGeneric" };

    const draft = await createDraft(user.id, parsed.data.regionId);
    await updateDraft(draft.id, user.id, {
      title: parsed.data.title,
      description: parsed.data.description,
      address: parsed.data.address,
      mapLat: parsed.data.mapLat ?? null,
      mapLng: parsed.data.mapLng ?? null,
    });
    return { ok: true, listingId: draft.id };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}

/** Autosave one step's fields onto an existing DRAFT. */
export async function saveStepAction(
  listingId: string,
  step: 1 | 3 | 4 | 5,
  raw: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireHostEligible();

    if (step === 1) {
      const p = step1Schema.safeParse(raw);
      if (!p.success) return { ok: false, error: "errorGeneric" };
      const patch: ListingDraftPatch = {
        regionId: p.data.regionId,
        title: p.data.title,
        description: p.data.description,
        address: p.data.address,
        mapLat: p.data.mapLat ?? null,
        mapLng: p.data.mapLng ?? null,
      };
      await updateDraft(listingId, user.id, patch);
      return { ok: true };
    }

    if (step === 3) {
      const p = step3Schema.safeParse(raw);
      if (!p.success) return { ok: false, error: "errorGeneric" };
      const patch: ListingDraftPatch = {
        bedrooms: p.data.bedrooms,
        beds: p.data.beds,
        baths: p.data.baths,
        maxGuests: p.data.maxGuests,
        poolLengthM: p.data.poolLengthM ?? null,
        poolWidthM: p.data.poolWidthM ?? null,
        poolDepthM: p.data.poolDepthM ?? null,
        amenities: p.data.amenities,
      };
      await updateDraft(listingId, user.id, patch);
      return { ok: true };
    }

    if (step === 4) {
      const p = step4Schema.safeParse(raw);
      if (!p.success) return { ok: false, error: "errorGeneric" };
      const patch: ListingDraftPatch = {
        partyPolicy: p.data.partyPolicy,
        quietHoursStart: p.data.quietHoursStart ?? null,
        quietHoursEnd: p.data.quietHoursEnd ?? null,
        cashDepositSatang: p.data.cashDepositSatang,
        checkInTime: p.data.checkInTime,
        checkOutTime: p.data.checkOutTime,
      };
      await updateDraft(listingId, user.id, patch);
      return { ok: true };
    }

    // step 5 — pricing, booking mode, seasons
    const p = step5Schema.safeParse(raw);
    if (!p.success) return { ok: false, error: "errorGeneric" };

    const instant = p.data.bookingMode === "INSTANT";
    const patch: ListingDraftPatch = {
      baseWeekdaySatang: p.data.baseWeekdaySatang,
      baseWeekendSatang: p.data.baseWeekendSatang,
      holidaySatang: p.data.holidaySatang ?? null,
      includedGuests: p.data.includedGuests,
      extraGuestFeeSatang: p.data.extraGuestFeeSatang,
      cancellationTier: p.data.cancellationTier,
      bookingMode: p.data.bookingMode,
      // Record the strike acknowledgment timestamp only while instant+acked.
      instantAckAt: instant && p.data.instantAck ? new Date() : null,
    };
    await updateDraft(listingId, user.id, patch);
    await replaceSeasons(
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

/** Step ② — store one uploaded photo (stub until #11) and attach the row. */
export async function addPhotoAction(
  listingId: string,
  file: { fileName: string; byteLength: number; contentType: string },
): Promise<ActionResult<{ photo: { id: string; r2Key: string; isCover: boolean; sortOrder: number } }>> {
  try {
    const user = await requireHostEligible();
    await assertOwnedDraft(listingId, user.id);

    const { r2Key } = await storePhoto({ listingId, ...file });
    const count = await prisma.listingPhoto.count({ where: { listingId } });
    const photo = await prisma.listingPhoto.create({
      data: { listingId, r2Key, sortOrder: count, isCover: count === 0 },
    });
    return {
      ok: true,
      photo: { id: photo.id, r2Key: photo.r2Key, isCover: photo.isCover, sortOrder: photo.sortOrder },
    };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}

/** Remove a photo; if it was the cover, promote the next one. */
export async function removePhotoAction(
  listingId: string,
  photoId: string,
): Promise<ActionResult> {
  try {
    const user = await requireHostEligible();
    await assertOwnedDraft(listingId, user.id);

    const photo = await prisma.listingPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.listingId !== listingId) {
      return { ok: false, error: "errorGeneric" };
    }
    await prisma.listingPhoto.delete({ where: { id: photoId } });
    if (photo.isCover) {
      const next = await prisma.listingPhoto.findFirst({
        where: { listingId },
        orderBy: { sortOrder: "asc" },
      });
      if (next) {
        await prisma.listingPhoto.update({
          where: { id: next.id },
          data: { isCover: true },
        });
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}

/** Choose the cover photo (exactly one cover per listing). */
export async function setCoverAction(
  listingId: string,
  photoId: string,
): Promise<ActionResult> {
  try {
    const user = await requireHostEligible();
    await assertOwnedDraft(listingId, user.id);

    await prisma.$transaction([
      prisma.listingPhoto.updateMany({
        where: { listingId },
        data: { isCover: false },
      }),
      prisma.listingPhoto.update({
        where: { id: photoId },
        data: { isCover: true },
      }),
    ]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}

/** Step ⑥ → submit for admin review (DRAFT → PENDING_REVIEW). */
export async function submitAction(listingId: string): Promise<ActionResult> {
  try {
    const user = await requireHostEligible();
    await submitForReview(listingId, user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}
