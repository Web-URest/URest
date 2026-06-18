import type Anthropic from "@anthropic-ai/sdk";
import { requirePhoneVerified } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { searchListings } from "@/lib/listing/queries";
import { buildQuote } from "@/lib/pricing/quote";
import type { SeasonRate } from "@/lib/pricing/quote";

import {
  createDraft,
  submitDraft,
  type DraftFailReason,
  type SubmitFailReason,
} from "./booking";
import type { ConciergeCard } from "./cards";

// Tool definitions (strict: true) — schemas from AI_CONCIERGE_SPEC §2.
export const CONCIERGE_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_listings",
    description:
      "Search real, published villa inventory. Call when the guest describes what they want (region, dates, group size, budget, amenities like สไลเดอร์/คาราโอเกะ/สัตว์เลี้ยง). Never describe villas from memory — always search first.",
    input_schema: {
      type: "object",
      properties: {
        region: { type: "string", description: "Region slug, e.g. pattaya" },
        check_in: { type: "string" },
        check_out: { type: "string" },
        guests: { type: "integer" },
        max_price_per_night: {
          type: "integer",
          description: "THB",
        },
        amenities: { type: "array", items: { type: "string" } },
        query: {
          type: "string",
          description: "Free-text semantic query in Thai or English",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "check_availability",
    description:
      "Live calendar check + exact quoted price for specific dates on one listing. Call before ever stating availability or a total price — quoted prices come only from this tool.",
    input_schema: {
      type: "object",
      properties: {
        listing_id: { type: "string" },
        check_in: { type: "string" },
        check_out: { type: "string" },
        guests: { type: "integer" },
      },
      required: ["listing_id", "check_in", "check_out", "guests"],
      additionalProperties: false,
    },
  },
  {
    name: "get_listing_details",
    description:
      "Full stored facts for one listing: amenities, pool specs, house rules & party policy, cancellation tier, booking mode, check-in/out times, capacity & fees, host response stats, host FAQ entries. Call whenever the guest asks ANY factual question about a specific villa. If the answer is not in the returned data, you do not know it.",
    input_schema: {
      type: "object",
      properties: { listing_id: { type: "string" } },
      required: ["listing_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_nearby_attractions",
    description:
      "Curated points of interest near a listing (restaurants, beaches, markets). Call for 'มีอะไรกินแถวนั้น / เที่ยวไหนใกล้ๆ' questions. Only the returned entries may be recommended.",
    input_schema: {
      type: "object",
      properties: {
        listing_id: { type: "string" },
        category: {
          type: "string",
          enum: ["food", "beach", "activity", "shopping", "any"],
        },
      },
      required: ["listing_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_saved_listings",
    description:
      "The guest's own saved villas (ที่บันทึกไว้). Call when the guest refers to villas they saved/hearted. Returns an empty list if the guest is logged out or has no saves.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "create_booking_draft",
    description:
      "Render the in-chat booking-summary confirmation card (dates, guests, per-night breakdown, total, house-rules note). Call when the guest has settled on a villa and dates. This does NOT create a booking.",
    input_schema: {
      type: "object",
      properties: {
        listing_id: { type: "string" },
        check_in: { type: "string" },
        check_out: { type: "string" },
        guests: { type: "integer" },
        note_to_host: { type: "string" },
      },
      required: ["listing_id", "check_in", "check_out", "guests"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_booking_request",
    description:
      "Create the real booking. Call ONLY after the system tells you the guest tapped Confirm for a specific draft — pass that draft_id. The guest's tap is the authorization (handled server-side); you never see or pass a token.",
    input_schema: {
      type: "object",
      properties: {
        draft_id: { type: "string" },
      },
      required: ["draft_id"],
      additionalProperties: false,
    },
  },
];

export type ToolInput = Record<string, unknown>;

/**
 * Tool result. `card` is a UI side-effect emitted to the browser + persisted, but
 * NEVER placed in the model's message history — so the QR URL / token never reach
 * the model (AC#4). The card shape lives in `./cards` (pure types, client-safe).
 */
export type ToolResult = { is_error: boolean; content: string; card?: ConciergeCard };

// Haversine for attraction distance
const R_KM = 6371;
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Off-platform payment keywords from AI_CONCIERGE_SPEC §4 rule 6.
// Presence in host content means the model must not relay them and should flag.
const OFF_PLATFORM_PAYMENT_RE = /เลขบัญชี|โอนตรง/;

export function hasOffPlatformPayment(text: string): boolean {
  return OFF_PLATFORM_PAYMENT_RE.test(text);
}

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function searchListingsHandler(input: ToolInput): Promise<ToolResult> {
  try {
    const maxPriceTHB = input.max_price_per_night as number | undefined;
    const maxPriceSatang = maxPriceTHB != null ? maxPriceTHB * 100 : undefined;

    let results = await searchListings({
      regionSlug: input.region as string | undefined,
      checkIn: input.check_in as string | undefined,
      checkOut: input.check_out as string | undefined,
      guests: input.guests as number | undefined,
      amenities: input.amenities as string[] | undefined,
    });

    if (maxPriceSatang != null) {
      results = results.filter((l) => l.baseWeekdaySatang <= maxPriceSatang);
    }

    const top = results.slice(0, 10);

    return {
      is_error: false,
      content: JSON.stringify({
        total: results.length,
        listings: top.map((l) => ({
          id: l.id,
          title: l.title,
          region: l.regionNameTh,
          bedrooms: l.bedrooms,
          max_guests: l.maxGuests,
          amenities: l.amenities,
          price_weekday_thb: Math.round(l.baseWeekdaySatang / 100),
          price_weekend_thb: Math.round(l.baseWeekendSatang / 100),
          booking_mode: l.bookingMode,
          legal_badge: !!l.legalBadgeAt,
        })),
        ...(results.length > 10
          ? { note: `แสดง 10 จาก ${results.length} รายการ` }
          : {}),
      }),
    };
  } catch {
    return {
      is_error: true,
      content: "ไม่สามารถค้นหาที่พักได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
    };
  }
}

async function checkAvailabilityHandler(input: ToolInput): Promise<ToolResult> {
  try {
    const listingId = input.listing_id as string;
    const checkIn = input.check_in as string;
    const checkOut = input.check_out as string;
    const guests = input.guests as number;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId, status: "PUBLISHED" },
      include: { seasons: { orderBy: { startDate: "asc" } } },
    });

    if (!listing) {
      return {
        is_error: true,
        content: "ไม่พบที่พักนี้ หรืออาจไม่ได้รับการเผยแพร่",
      };
    }

    if (guests > listing.maxGuests) {
      return {
        is_error: false,
        content: JSON.stringify({
          available: false,
          reason: `ที่พักรองรับได้สูงสุด ${listing.maxGuests} คน`,
        }),
      };
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    const calendarConflict = await prisma.calendarBlock.findFirst({
      where: {
        listingId,
        startDate: { lt: checkOutDate },
        endDate: { gt: checkInDate },
      },
    });

    const bookingConflict = await prisma.booking.findFirst({
      where: {
        listingId,
        status: { in: ["AWAITING_PAYMENT", "CONFIRMED", "CHECKED_IN"] },
        checkIn: { lt: checkOutDate },
        checkOut: { gt: checkInDate },
      },
    });

    if (calendarConflict ?? bookingConflict) {
      return {
        is_error: false,
        content: JSON.stringify({
          available: false,
          reason: "วันที่ที่เลือกไม่ว่าง",
        }),
      };
    }

    const holidays = await prisma.thaiHoliday.findMany({ select: { date: true } });
    const holidaySet = new Set(
      holidays.map((h) => h.date.toISOString().slice(0, 10)),
    );

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
      checkIn,
      checkOut,
      guests,
    });

    return {
      is_error: false,
      content: JSON.stringify({
        available: true,
        listing_id: listingId,
        check_in: checkIn,
        check_out: checkOut,
        nights: quote.nightCount,
        guests,
        price_lines: quote.nights.map((n) => ({
          date: n.date,
          rule: n.rule,
          ...(n.seasonNameTh ? { season: n.seasonNameTh } : {}),
          price_thb: Math.round(n.rateSatang / 100),
        })),
        extra_guest_fee_thb: Math.round(quote.extraGuestFeeSatang / 100),
        total_thb: Math.round(quote.totalSatang / 100),
      }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return {
      is_error: true,
      content: `เกิดข้อผิดพลาดในการตรวจสอบวันว่าง: ${msg}`,
    };
  }
}

async function getListingDetailsHandler(input: ToolInput): Promise<ToolResult> {
  try {
    const listingId = input.listing_id as string;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId, status: "PUBLISHED" },
      include: {
        region: { select: { nameTh: true } },
        host: { select: { displayName: true } },
        faqEntries: {
          where: { status: "PUBLISHED" },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!listing) {
      return {
        is_error: true,
        content: "ไม่พบที่พักนี้ หรืออาจไม่ได้รับการเผยแพร่",
      };
    }

    // Detect off-platform payment injection (AI_CONCIERGE_SPEC §4 rule 6)
    const paymentInjection =
      hasOffPlatformPayment(listing.description) ||
      listing.faqEntries.some(
        (e) => hasOffPlatformPayment(e.question) || hasOffPlatformPayment(e.answer),
      );

    return {
      is_error: false,
      content: JSON.stringify({
        id: listing.id,
        title: listing.title,
        region: listing.region.nameTh,
        // Host-written content wrapped in injection-defense tags (§4 rule 5)
        description: `<host_content>${listing.description}</host_content>`,
        property_type: listing.propertyType,
        bedrooms: listing.bedrooms,
        beds: listing.beds,
        baths: listing.baths,
        max_guests: listing.maxGuests,
        included_guests: listing.includedGuests,
        extra_guest_fee_thb: Math.round(listing.extraGuestFeeSatang / 100),
        pool:
          listing.poolLengthM != null
            ? {
                length_m: parseFloat(listing.poolLengthM.toString()),
                width_m:
                  listing.poolWidthM != null
                    ? parseFloat(listing.poolWidthM.toString())
                    : null,
                depth_m:
                  listing.poolDepthM != null
                    ? parseFloat(listing.poolDepthM.toString())
                    : null,
              }
            : null,
        amenities: listing.amenities,
        party_policy: listing.partyPolicy,
        quiet_hours:
          listing.quietHoursStart != null
            ? `${listing.quietHoursStart}–${listing.quietHoursEnd}`
            : null,
        cash_deposit_thb: Math.round(listing.cashDepositSatang / 100),
        check_in_time: listing.checkInTime,
        check_out_time: listing.checkOutTime,
        base_price_weekday_thb: Math.round(listing.baseWeekdaySatang / 100),
        base_price_weekend_thb: Math.round(listing.baseWeekendSatang / 100),
        cancellation_tier: listing.cancellationTier,
        booking_mode: listing.bookingMode,
        host: { display_name: listing.host.displayName },
        // FAQ — host-written, injection-defended
        faq: listing.faqEntries.map((e) => ({
          question: `<host_content>${e.question}</host_content>`,
          answer: `<host_content>${e.answer}</host_content>`,
        })),
        // Signal to the model: do not relay payment content, flag the listing
        ...(paymentInjection ? { _payment_injection_detected: true } : {}),
      }),
    };
  } catch {
    return {
      is_error: true,
      content: "ไม่สามารถโหลดข้อมูลที่พักได้ในขณะนี้",
    };
  }
}

async function getNearbyAttractionsHandler(
  input: ToolInput,
): Promise<ToolResult> {
  try {
    const listingId = input.listing_id as string;
    const category = (input.category as string | undefined) ?? "any";

    const listing = await prisma.listing.findUnique({
      where: { id: listingId, status: "PUBLISHED" },
      select: { regionId: true, mapLat: true, mapLng: true },
    });

    if (!listing) {
      return {
        is_error: true,
        content: "ไม่พบที่พักนี้ หรืออาจไม่ได้รับการเผยแพร่",
      };
    }

    const attractions = await prisma.attraction.findMany({
      where: {
        regionId: listing.regionId,
        isActive: true,
        ...(category !== "any"
          ? {
              category:
                category.toUpperCase() as
                  | "FOOD"
                  | "BEACH"
                  | "ACTIVITY"
                  | "SHOPPING",
            }
          : {}),
      },
    });

    const withDistance = attractions
      .map((a) => ({
        id: a.id,
        name: a.nameTh,
        category: a.category,
        // descTh is curated by admin — still wrap to be consistent
        description: `<host_content>${a.descTh}</host_content>`,
        dist_km:
          listing.mapLat != null && listing.mapLng != null
            ? Math.round(
                haversineKm(listing.mapLat, listing.mapLng, a.lat, a.lng) * 10,
              ) / 10
            : null,
      }))
      .sort((a, b) => (a.dist_km ?? 999) - (b.dist_km ?? 999))
      .slice(0, 8);

    return {
      is_error: false,
      content: JSON.stringify({
        listing_id: listingId,
        category_filter: category,
        attractions: withDistance,
      }),
    };
  } catch {
    return {
      is_error: true,
      content: "ไม่สามารถโหลดข้อมูลสถานที่ใกล้เคียงได้",
    };
  }
}

async function getSavedListingsHandler(
  userId: string | null,
): Promise<ToolResult> {
  if (!userId) {
    return {
      is_error: false,
      content: JSON.stringify({
        saved: [],
        message: "กรุณาเข้าสู่ระบบเพื่อดูที่พักที่บันทึกไว้",
      }),
    };
  }

  try {
    const saved = await prisma.savedVilla.findMany({
      where: { userId },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            status: true,
            bedrooms: true,
            maxGuests: true,
            amenities: true,
            baseWeekdaySatang: true,
            baseWeekendSatang: true,
            bookingMode: true,
            legalBadgeAt: true,
            region: { select: { nameTh: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const publishedSaved = saved.filter(
      (s) => s.listing.status === "PUBLISHED",
    );

    if (publishedSaved.length === 0) {
      return {
        is_error: false,
        content: JSON.stringify({
          saved: [],
          message: "ยังไม่มีที่พักที่บันทึกไว้",
        }),
      };
    }

    return {
      is_error: false,
      content: JSON.stringify({
        saved: publishedSaved.map((s) => ({
          id: s.listing.id,
          title: s.listing.title,
          region: s.listing.region.nameTh,
          bedrooms: s.listing.bedrooms,
          max_guests: s.listing.maxGuests,
          amenities: s.listing.amenities as string[],
          price_weekday_thb: Math.round(s.listing.baseWeekdaySatang / 100),
          price_weekend_thb: Math.round(s.listing.baseWeekendSatang / 100),
          booking_mode: s.listing.bookingMode,
          legal_badge: !!s.listing.legalBadgeAt,
          saved_at: s.createdAt.toISOString().slice(0, 10),
        })),
      }),
    };
  } catch {
    return {
      is_error: true,
      content: "ไม่สามารถโหลดรายการที่บันทึกไว้ได้",
    };
  }
}

// ── Booking tools (#32) ───────────────────────────────────────────────────────

function draftReasonTh(reason: DraftFailReason): string {
  switch (reason) {
    case "LISTING_NOT_FOUND":
      return "ไม่พบที่พักนี้ค่ะ";
    case "OVER_CAPACITY":
      return "จำนวนผู้เข้าพักเกินที่ที่พักรองรับค่ะ";
    case "UNAVAILABLE":
      return "วันที่เลือกไม่ว่างแล้วค่ะ ลองวันอื่นได้ไหมคะ";
  }
}

function submitReasonTh(reason: SubmitFailReason): string {
  switch (reason) {
    case "NOT_FOUND":
      return "ไม่พบรายการจองค่ะ";
    case "NEEDS_CONFIRM":
      return "กรุณากดยืนยันการจองในการ์ดก่อนค่ะ";
    case "EXPIRED":
      return "การยืนยันหมดอายุแล้ว กรุณาเริ่มทำรายการใหม่อีกครั้งค่ะ";
    case "ALREADY_SUBMITTED":
      return "รายการนี้ส่งคำขอจองไปแล้วค่ะ";
    case "DATES_TAKEN":
      return "ขออภัยค่ะ วันที่เลือกเพิ่งถูกจองไป ลองวันอื่นนะคะ";
  }
}

async function createBookingDraftHandler(
  input: ToolInput,
  userId: string | null,
  sessionId: string | null,
): Promise<ToolResult> {
  if (!userId || !sessionId) {
    return { is_error: true, content: "กรุณาเข้าสู่ระบบเพื่อทำการจองค่ะ" };
  }

  const res = await createDraft(
    {
      sessionId,
      userId,
      listingId: input.listing_id as string,
      checkIn: input.check_in as string,
      checkOut: input.check_out as string,
      guests: input.guests as number,
      noteToHost: input.note_to_host as string | undefined,
    },
    new Date(),
  );
  if (!res.ok) return { is_error: true, content: draftReasonTh(res.reason) };

  const d = res.draft;
  const priceLinesThb = d.priceLines.map((p) => ({
    date: p.date,
    rule: p.rule,
    ...(p.season ? { season: p.season } : {}),
    priceThb: Math.round(p.priceSatang / 100),
  }));

  return {
    is_error: false,
    content: JSON.stringify({
      draft_id: d.draftId,
      title: d.title,
      check_in: d.checkIn,
      check_out: d.checkOut,
      nights: d.nights,
      guests: d.guests,
      total_thb: Math.round(d.totalSatang / 100),
    }),
    card: {
      kind: "booking_draft",
      draftId: d.draftId,
      title: d.title,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      nights: d.nights,
      guests: d.guests,
      totalThb: Math.round(d.totalSatang / 100),
      priceLines: priceLinesThb,
    },
  };
}

async function submitBookingRequestHandler(
  input: ToolInput,
  userId: string | null,
  sessionId: string | null,
): Promise<ToolResult> {
  if (!userId || !sessionId) {
    return { is_error: true, content: "กรุณาเข้าสู่ระบบเพื่อทำการจองค่ะ" };
  }
  try {
    await requirePhoneVerified();
  } catch {
    return { is_error: true, content: "กรุณายืนยันเบอร์โทรศัพท์ก่อนทำการจองค่ะ" };
  }

  const res = await submitDraft(input.draft_id as string, userId, new Date());
  if (!res.ok) return { is_error: true, content: submitReasonTh(res.reason) };

  if (res.mode === "INSTANT") {
    return {
      is_error: false,
      content: JSON.stringify({ success: true, booking_code: res.code, status: "awaiting_payment" }),
      card: {
        kind: "payment_qr",
        bookingId: res.bookingId,
        code: res.code,
        qrUrl: res.qrUrl,
        payUrl: `/trips/${res.bookingId}/pay`,
      },
    };
  }

  return {
    is_error: false,
    content: JSON.stringify({ success: true, booking_code: res.code, status: "requested" }),
    card: { kind: "request_sent", bookingId: res.bookingId, code: res.code, tripUrl: `/trips/${res.bookingId}` },
  };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function handleToolCall(
  name: string,
  input: ToolInput,
  userId: string | null,
  sessionId: string | null = null,
): Promise<ToolResult> {
  switch (name) {
    case "search_listings":
      return searchListingsHandler(input);
    case "check_availability":
      return checkAvailabilityHandler(input);
    case "get_listing_details":
      return getListingDetailsHandler(input);
    case "get_nearby_attractions":
      return getNearbyAttractionsHandler(input);
    case "get_saved_listings":
      return getSavedListingsHandler(userId);
    case "create_booking_draft":
      return createBookingDraftHandler(input, userId, sessionId);
    case "submit_booking_request":
      return submitBookingRequestHandler(input, userId, sessionId);
    default:
      return { is_error: true, content: `Unknown tool: ${name}` };
  }
}
