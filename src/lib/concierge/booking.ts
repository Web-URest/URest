/**
 * Concierge in-chat booking lifecycle (#32, AI_CONCIERGE_SPEC §3). The testable
 * core behind the `create_booking_draft` / `submit_booking_request` tools:
 *
 *   createDraft  → quote + availability + a ConciergeBookingDraft snapshot
 *   confirmDraft → mints the server-side confirmation token on the guest's tap
 *   submitDraft  → gated by that token (presence + 10-min window + single-use),
 *                  creates the real booking via lib/booking (rule 2)
 *
 * The confirmation token is server-side ONLY — the model is handed `draft_id`
 * and never sees a token or QR (AC#4). The gate is the confirmation STATE
 * (`confirmedAt` + `confirmTokenExpiresAt` window + `consumedBookingId`); the
 * stored hash is the proof-of-tap record. Money is integer satang (rule 1).
 */
import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { instantHold, request, type BookingDraft } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { createPromptPayCharge } from "@/lib/payments/opn";
import { buildQuote, type SeasonRate } from "@/lib/pricing/quote";

export const CONFIRM_TTL_MS = 10 * 60 * 1000;
export const DRAFT_TTL_MS = 30 * 60 * 1000;

export interface DraftSummary {
  draftId: string;
  listingId: string;
  title: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  totalSatang: number;
  priceLines: { date: string; rule: string; season?: string; priceSatang: number }[];
}

export type DraftFailReason = "LISTING_NOT_FOUND" | "OVER_CAPACITY" | "UNAVAILABLE";
export type DraftResult = { ok: true; draft: DraftSummary } | { ok: false; reason: DraftFailReason };

export type SubmitFailReason = "NOT_FOUND" | "NEEDS_CONFIRM" | "EXPIRED" | "ALREADY_SUBMITTED" | "DATES_TAKEN";
export type SubmitResult =
  | { ok: true; bookingId: string; code: string | null; mode: "REQUEST" | "INSTANT"; qrUrl?: string }
  | { ok: false; reason: SubmitFailReason };

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Quote + availability + write a draft snapshot. No booking, no money moves. */
export async function createDraft(
  input: {
    sessionId: string;
    userId: string;
    listingId: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    noteToHost?: string;
  },
  now: Date,
): Promise<DraftResult> {
  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId, status: "PUBLISHED" },
    include: { seasons: { orderBy: { startDate: "asc" } } },
  });
  if (!listing) return { ok: false, reason: "LISTING_NOT_FOUND" };
  if (input.guests > listing.maxGuests) return { ok: false, reason: "OVER_CAPACITY" };

  const checkInDate = new Date(input.checkIn);
  const checkOutDate = new Date(input.checkOut);

  const [calendarConflict, bookingConflict] = await Promise.all([
    prisma.calendarBlock.findFirst({
      where: { listingId: input.listingId, startDate: { lt: checkOutDate }, endDate: { gt: checkInDate } },
    }),
    prisma.booking.findFirst({
      where: {
        listingId: input.listingId,
        status: { in: ["AWAITING_PAYMENT", "CONFIRMED", "CHECKED_IN"] },
        checkIn: { lt: checkOutDate },
        checkOut: { gt: checkInDate },
      },
    }),
  ]);
  if (calendarConflict ?? bookingConflict) return { ok: false, reason: "UNAVAILABLE" };

  const holidays = await prisma.thaiHoliday.findMany({ select: { date: true } });
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
  const seasons: SeasonRate[] = listing.seasons.map((s) => ({
    startDate: s.startDate.toISOString().slice(0, 10),
    endDate: s.endDate.toISOString().slice(0, 10),
    weekdaySatang: s.weekdaySatang,
    weekendSatang: s.weekendSatang,
    nameTh: s.nameTh,
  }));

  const quote = buildQuote({
    config: {
      baseWeekdaySatang: listing.baseWeekdaySatang,
      baseWeekendSatang: listing.baseWeekendSatang,
      holidaySatang: listing.holidaySatang,
      includedGuests: listing.includedGuests,
      extraGuestFeeSatang: listing.extraGuestFeeSatang,
    },
    seasons,
    holidays: holidaySet,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: input.guests,
  });

  const row = await prisma.conciergeBookingDraft.create({
    data: {
      sessionId: input.sessionId,
      userId: input.userId,
      listingId: input.listingId,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      guests: input.guests,
      priceLines: quote.nights as unknown as Prisma.InputJsonValue,
      totalSatang: quote.totalSatang,
      commissionSatang: quote.commissionSatang,
      cancellationTier: listing.cancellationTier,
      guestNoteToHost: input.noteToHost?.trim() || null,
      expiresAt: new Date(now.getTime() + DRAFT_TTL_MS),
    },
  });

  return {
    ok: true,
    draft: {
      draftId: row.id,
      listingId: listing.id,
      title: listing.title,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nights: quote.nightCount,
      guests: input.guests,
      totalSatang: quote.totalSatang,
      priceLines: quote.nights.map((n) => ({
        date: n.date,
        rule: n.rule,
        ...(n.seasonNameTh ? { season: n.seasonNameTh } : {}),
        priceSatang: n.rateSatang,
      })),
    },
  };
}

/** Mint the confirmation token on the guest's tap (server-side; never returned to the model). */
export async function confirmDraft(
  draftId: string,
  userId: string,
  now: Date,
): Promise<{ ok: boolean; reason?: string }> {
  const draft = await prisma.conciergeBookingDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.userId !== userId) return { ok: false, reason: "NOT_FOUND" };
  if (draft.consumedBookingId) return { ok: false, reason: "ALREADY_SUBMITTED" };
  if (draft.expiresAt < now) return { ok: false, reason: "EXPIRED" };

  const token = crypto.randomBytes(24).toString("base64url");
  await prisma.conciergeBookingDraft.update({
    where: { id: draftId },
    data: {
      confirmedAt: now,
      confirmTokenHash: hashToken(token),
      confirmTokenExpiresAt: new Date(now.getTime() + CONFIRM_TTL_MS),
    },
  });
  return { ok: true };
}

/** Submit a confirmed draft → real booking. The token gate is server-side state. */
export async function submitDraft(draftId: string, userId: string, now: Date): Promise<SubmitResult> {
  const draft = await prisma.conciergeBookingDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.userId !== userId) return { ok: false, reason: "NOT_FOUND" };
  if (draft.consumedBookingId) return { ok: false, reason: "ALREADY_SUBMITTED" };
  if (!draft.confirmedAt || !draft.confirmTokenHash || !draft.confirmTokenExpiresAt) {
    return { ok: false, reason: "NEEDS_CONFIRM" };
  }
  if (draft.confirmTokenExpiresAt < now) return { ok: false, reason: "EXPIRED" };

  const listing = await prisma.listing.findUnique({
    where: { id: draft.listingId },
    select: { bookingMode: true, hostId: true, title: true },
  });
  if (!listing) return { ok: false, reason: "NOT_FOUND" };

  const bookingDraft: BookingDraft = {
    listingId: draft.listingId,
    userId: draft.userId,
    checkIn: draft.checkIn,
    checkOut: draft.checkOut,
    priceLines: draft.priceLines as Prisma.InputJsonValue,
    totalSatang: draft.totalSatang,
    commissionSatang: draft.commissionSatang,
    cancellationTier: draft.cancellationTier,
    guestNoteToHost: draft.guestNoteToHost,
  };

  let booking;
  try {
    booking =
      listing.bookingMode === "INSTANT"
        ? await instantHold(bookingDraft, now)
        : await request(bookingDraft, now);
  } catch {
    // The double-booking GiST exclusion fires if the dates were taken since the draft.
    return { ok: false, reason: "DATES_TAKEN" };
  }

  await prisma.conciergeBookingDraft.update({
    where: { id: draftId },
    data: { consumedBookingId: booking.id },
  });

  if (listing.bookingMode === "INSTANT") {
    const charge = await createPromptPayCharge({ amountSatang: draft.totalSatang, bookingId: booking.id });
    return {
      ok: true,
      bookingId: booking.id,
      code: booking.code,
      mode: "INSTANT",
      qrUrl: charge.source?.scannable_code?.image?.download_uri,
    };
  }

  const guest = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  await notify(listing.hostId, "BOOKING_REQUESTED", {
    listingTitle: listing.title,
    guestName: guest?.displayName ?? "",
  });

  return { ok: true, bookingId: booking.id, code: booking.code, mode: "REQUEST" };
}
