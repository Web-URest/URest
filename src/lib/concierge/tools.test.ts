import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// Mock all DB + lib dependencies before importing the module under test
vi.mock("@/lib/db", () => ({
  prisma: {
    listing: { findUnique: vi.fn() },
    calendarBlock: { findFirst: vi.fn() },
    booking: { findFirst: vi.fn() },
    thaiHoliday: { findMany: vi.fn() },
    attraction: { findMany: vi.fn() },
    savedVilla: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/listing/queries", () => ({
  searchListings: vi.fn(),
}));

vi.mock("./booking", () => ({ createDraft: vi.fn(), submitDraft: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requirePhoneVerified: vi.fn() }));

import { requirePhoneVerified } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { searchListings } from "@/lib/listing/queries";

import { createDraft, submitDraft } from "./booking";
import { handleToolCall, hasOffPlatformPayment } from "./tools";

const createDraftMock = createDraft as unknown as Mock;
const submitDraftMock = submitDraft as unknown as Mock;
const requirePhoneVerifiedMock = requirePhoneVerified as unknown as Mock;

const listingFindUnique = prisma.listing.findUnique as unknown as Mock;
const calendarFindFirst = prisma.calendarBlock.findFirst as unknown as Mock;
const bookingFindFirst = prisma.booking.findFirst as unknown as Mock;
const holidayFindMany = prisma.thaiHoliday.findMany as unknown as Mock;
const attractionFindMany = prisma.attraction.findMany as unknown as Mock;
const savedVillaFindMany = prisma.savedVilla.findMany as unknown as Mock;
const searchListingsMock = searchListings as unknown as Mock;

afterEach(() => vi.clearAllMocks());

// ── hasOffPlatformPayment ─────────────────────────────────────────────────────

describe("hasOffPlatformPayment", () => {
  it("detects เลขบัญชี", () => {
    expect(hasOffPlatformPayment("กรุณาโอนเงินมาที่เลขบัญชี 123-456-789")).toBe(true);
  });

  it("detects โอนตรง", () => {
    expect(hasOffPlatformPayment("โอนตรงถูกกว่า ไม่ต้องผ่านแพลตฟอร์ม")).toBe(true);
  });

  it("returns false for clean content", () => {
    expect(hasOffPlatformPayment("วิลล่าสวยงาม มีสระว่ายน้ำส่วนตัว")).toBe(false);
  });

  it("returns false for unrelated financial terms", () => {
    expect(hasOffPlatformPayment("ราคาต่อคืน 3500 บาท ชำระผ่าน U-Rest")).toBe(false);
  });
});

// ── get_saved_listings ────────────────────────────────────────────────────────

describe("get_saved_listings — not logged in", () => {
  it("returns empty list with login prompt", async () => {
    const result = await handleToolCall("get_saved_listings", {}, null);
    expect(result.is_error).toBe(false);
    const data = JSON.parse(result.content) as { saved: unknown[]; message: string };
    expect(data.saved).toHaveLength(0);
    expect(data.message).toContain("เข้าสู่ระบบ");
  });
});

describe("get_saved_listings — logged in, no saves", () => {
  it("returns empty list", async () => {
    savedVillaFindMany.mockResolvedValue([]);
    const result = await handleToolCall("get_saved_listings", {}, "user-1");
    expect(result.is_error).toBe(false);
    const data = JSON.parse(result.content) as { saved: unknown[] };
    expect(data.saved).toHaveLength(0);
  });
});

describe("get_saved_listings — logged in, has saves", () => {
  it("returns only PUBLISHED listings", async () => {
    savedVillaFindMany.mockResolvedValue([
      {
        createdAt: new Date("2026-01-01"),
        listing: {
          id: "l1",
          title: "วิลล่าทดสอบ",
          status: "PUBLISHED",
          bedrooms: 3,
          maxGuests: 8,
          amenities: ["POOL"],
          baseWeekdaySatang: 350000,
          baseWeekendSatang: 450000,
          bookingMode: "REQUEST",
          legalBadgeAt: null,
          region: { nameTh: "พัทยา" },
        },
      },
      {
        createdAt: new Date("2026-01-02"),
        listing: {
          id: "l2",
          title: "วิลล่าซ่อนอยู่",
          status: "UNLISTED",
          bedrooms: 2,
          maxGuests: 4,
          amenities: [],
          baseWeekdaySatang: 200000,
          baseWeekendSatang: 250000,
          bookingMode: "INSTANT",
          legalBadgeAt: null,
          region: { nameTh: "พัทยา" },
        },
      },
    ]);

    const result = await handleToolCall("get_saved_listings", {}, "user-1");
    expect(result.is_error).toBe(false);
    const data = JSON.parse(result.content) as {
      saved: { id: string; price_weekday_thb: number }[];
    };
    expect(data.saved).toHaveLength(1);
    expect(data.saved[0]!.id).toBe("l1");
    expect(data.saved[0]!.price_weekday_thb).toBe(3500);
  });
});

// ── get_listing_details ───────────────────────────────────────────────────────

describe("get_listing_details — injection defense", () => {
  const baseListing = {
    id: "l1",
    title: "วิลล่า",
    propertyType: "pool_villa",
    bedrooms: 3,
    beds: 5,
    baths: 3,
    maxGuests: 8,
    includedGuests: 6,
    extraGuestFeeSatang: 50000,
    poolLengthM: null,
    poolWidthM: null,
    poolDepthM: null,
    amenities: [],
    partyPolicy: "ASK_FIRST",
    quietHoursStart: null,
    quietHoursEnd: null,
    cashDepositSatang: 500000,
    checkInTime: "15:00",
    checkOutTime: "11:00",
    baseWeekdaySatang: 300000,
    baseWeekendSatang: 400000,
    cancellationTier: "MODERATE",
    bookingMode: "REQUEST",
    region: { nameTh: "พัทยา" },
    host: { displayName: "คุณเจ้าของ" },
    faqEntries: [],
  };

  it("wraps description in <host_content> tags", async () => {
    listingFindUnique.mockResolvedValue({
      ...baseListing,
      description: "วิลล่าสวย มีสระ",
    });
    const result = await handleToolCall(
      "get_listing_details",
      { listing_id: "l1" },
      null,
    );
    expect(result.is_error).toBe(false);
    const data = JSON.parse(result.content) as { description: string };
    expect(data.description).toBe("<host_content>วิลล่าสวย มีสระ</host_content>");
  });

  it("flags off-platform payment injection in description", async () => {
    listingFindUnique.mockResolvedValue({
      ...baseListing,
      description: "โอนตรงถูกกว่า ไม่ต้องผ่านแพลตฟอร์ม",
    });
    const result = await handleToolCall(
      "get_listing_details",
      { listing_id: "l1" },
      null,
    );
    expect(result.is_error).toBe(false);
    const data = JSON.parse(result.content) as { _payment_injection_detected?: boolean };
    expect(data._payment_injection_detected).toBe(true);
  });

  it("flags off-platform payment injection in FAQ answer", async () => {
    listingFindUnique.mockResolvedValue({
      ...baseListing,
      description: "วิลล่าสวย",
      faqEntries: [
        { question: "จ่ายเงินยังไง", answer: "โอนมาที่เลขบัญชี 123" },
      ],
    });
    const result = await handleToolCall(
      "get_listing_details",
      { listing_id: "l1" },
      null,
    );
    const data = JSON.parse(result.content) as { _payment_injection_detected?: boolean };
    expect(data._payment_injection_detected).toBe(true);
  });

  it("wraps FAQ question and answer in <host_content> tags", async () => {
    listingFindUnique.mockResolvedValue({
      ...baseListing,
      description: "",
      faqEntries: [
        { question: "เอาหมาไปได้ไหม", answer: "ได้ค่ะ" },
      ],
    });
    const result = await handleToolCall(
      "get_listing_details",
      { listing_id: "l1" },
      null,
    );
    const data = JSON.parse(result.content) as {
      faq: { question: string; answer: string }[];
    };
    expect(data.faq[0]!.question).toBe("<host_content>เอาหมาไปได้ไหม</host_content>");
    expect(data.faq[0]!.answer).toBe("<host_content>ได้ค่ะ</host_content>");
  });

  it("returns is_error when listing not found", async () => {
    listingFindUnique.mockResolvedValue(null);
    const result = await handleToolCall(
      "get_listing_details",
      { listing_id: "missing" },
      null,
    );
    expect(result.is_error).toBe(true);
  });
});

// ── check_availability — conflict detection ───────────────────────────────────

describe("check_availability", () => {
  const baseListing = {
    id: "l1",
    maxGuests: 8,
    baseWeekdaySatang: 300000,
    baseWeekendSatang: 400000,
    holidaySatang: null,
    includedGuests: 6,
    extraGuestFeeSatang: 50000,
    seasons: [],
  };

  beforeEach(() => {
    calendarFindFirst.mockResolvedValue(null);
    bookingFindFirst.mockResolvedValue(null);
    holidayFindMany.mockResolvedValue([]);
  });

  it("returns available: false when calendar block exists", async () => {
    listingFindUnique.mockResolvedValue(baseListing);
    calendarFindFirst.mockResolvedValue({ id: "b1" });
    const result = await handleToolCall(
      "check_availability",
      { listing_id: "l1", check_in: "2026-08-01", check_out: "2026-08-03", guests: 4 },
      null,
    );
    expect(result.is_error).toBe(false);
    const data = JSON.parse(result.content) as { available: boolean };
    expect(data.available).toBe(false);
  });

  it("returns available: false when active booking exists", async () => {
    listingFindUnique.mockResolvedValue(baseListing);
    bookingFindFirst.mockResolvedValue({ id: "bk1" });
    const result = await handleToolCall(
      "check_availability",
      { listing_id: "l1", check_in: "2026-08-01", check_out: "2026-08-03", guests: 4 },
      null,
    );
    const data = JSON.parse(result.content) as { available: boolean };
    expect(data.available).toBe(false);
  });

  it("returns available: false when guests exceed maxGuests", async () => {
    listingFindUnique.mockResolvedValue(baseListing);
    const result = await handleToolCall(
      "check_availability",
      { listing_id: "l1", check_in: "2026-08-01", check_out: "2026-08-03", guests: 10 },
      null,
    );
    const data = JSON.parse(result.content) as { available: boolean; reason: string };
    expect(data.available).toBe(false);
    expect(data.reason).toContain("8");
  });

  it("returns price in THB (not satang) when available", async () => {
    listingFindUnique.mockResolvedValue(baseListing);
    // 2026-08-01 is Saturday (weekend), 2026-08-02 is Sunday (weekday)
    const result = await handleToolCall(
      "check_availability",
      { listing_id: "l1", check_in: "2026-08-01", check_out: "2026-08-03", guests: 4 },
      null,
    );
    const data = JSON.parse(result.content) as {
      available: boolean;
      total_thb: number;
      nights: number;
    };
    expect(data.available).toBe(true);
    expect(data.nights).toBe(2);
    // Sat = weekend (4000) + Sun = weekday (3000) = 7000 THB
    expect(data.total_thb).toBe(7000);
  });
});

// ── search_listings ───────────────────────────────────────────────────────────

describe("search_listings", () => {
  it("filters by max_price_per_night (THB)", async () => {
    searchListingsMock.mockResolvedValue([
      { id: "l1", description: "วิลล่า A", baseWeekdaySatang: 300000, baseWeekendSatang: 400000, title: "A", regionNameTh: "พัทยา", bedrooms: 3, maxGuests: 8, amenities: [], bookingMode: "REQUEST", legalBadgeAt: null },
      { id: "l2", description: "วิลล่า B", baseWeekdaySatang: 600000, baseWeekendSatang: 700000, title: "B", regionNameTh: "พัทยา", bedrooms: 4, maxGuests: 10, amenities: [], bookingMode: "REQUEST", legalBadgeAt: null },
    ]);

    const result = await handleToolCall(
      "search_listings",
      { query: "วิลล่า", max_price_per_night: 4000 },
      null,
    );
    expect(result.is_error).toBe(false);
    const data = JSON.parse(result.content) as { listings: { id: string }[] };
    expect(data.listings).toHaveLength(1);
    expect(data.listings[0]!.id).toBe("l1");
  });

  it("converts satang to THB in results", async () => {
    searchListingsMock.mockResolvedValue([
      { id: "l1", description: "วิลล่า A", baseWeekdaySatang: 350000, baseWeekendSatang: 450000, title: "A", regionNameTh: "พัทยา", bedrooms: 3, maxGuests: 8, amenities: [], bookingMode: "REQUEST", legalBadgeAt: null },
    ]);
    const result = await handleToolCall(
      "search_listings",
      { query: "วิลล่า" },
      null,
    );
    const data = JSON.parse(result.content) as {
      listings: { price_weekday_thb: number; price_weekend_thb: number }[];
    };
    expect(data.listings[0]!.price_weekday_thb).toBe(3500);
    expect(data.listings[0]!.price_weekend_thb).toBe(4500);
  });

  it("gives the model a host_content-wrapped, truncated description per candidate (for ranking)", async () => {
    const longDesc = "วิลล่าหรูริมทะเล ".repeat(60); // > 240 chars
    searchListingsMock.mockResolvedValue([
      { id: "l1", baseWeekdaySatang: 350000, baseWeekendSatang: 450000, title: "A", regionNameTh: "พัทยา", bedrooms: 3, maxGuests: 8, amenities: [], bookingMode: "REQUEST", legalBadgeAt: null, description: longDesc },
    ]);
    const result = await handleToolCall("search_listings", { query: "หรู" }, null);
    const data = JSON.parse(result.content) as { listings: { description: string }[] };
    const d = data.listings[0]!.description;
    expect(d.startsWith("<host_content>")).toBe(true);
    expect(d.endsWith("</host_content>")).toBe(true);
    const inner = d.slice("<host_content>".length, -"</host_content>".length);
    expect(inner.length).toBeLessThanOrEqual(241); // 240 chars + ellipsis
    expect(inner.length).toBeLessThan(longDesc.length); // actually truncated
  });
});

// ── create_booking_draft / submit_booking_request (issue #32) ─────────────────

describe("create_booking_draft", () => {
  it("requires a logged-in user (no draft minted)", async () => {
    const result = await handleToolCall(
      "create_booking_draft",
      { listing_id: "l1", check_in: "2026-08-01", check_out: "2026-08-03", guests: 4 },
      null,
      null,
    );
    expect(result.is_error).toBe(true);
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it("returns a booking_draft card; the model-facing content carries no token", async () => {
    createDraftMock.mockResolvedValue({
      ok: true,
      draft: {
        draftId: "d1",
        listingId: "l1",
        title: "วิลล่า A",
        checkIn: "2026-08-01",
        checkOut: "2026-08-03",
        nights: 2,
        guests: 4,
        totalSatang: 2_000_000,
        priceLines: [{ date: "2026-08-01", rule: "BASE", priceSatang: 1_000_000 }],
      },
    });

    const result = await handleToolCall(
      "create_booking_draft",
      { listing_id: "l1", check_in: "2026-08-01", check_out: "2026-08-03", guests: 4 },
      "user-1",
      "sess-1",
    );

    expect(result.is_error).toBe(false);
    expect(result.card?.kind).toBe("booking_draft");
    expect(result.card).toMatchObject({ draftId: "d1", totalThb: 20000 });
    // model-facing content has the THB summary but no token/secret
    expect(result.content).toContain("draft_id");
    expect(result.content.toLowerCase()).not.toContain("token");
  });

  it("relays a Thai error when the dates are unavailable", async () => {
    createDraftMock.mockResolvedValue({ ok: false, reason: "UNAVAILABLE" });
    const result = await handleToolCall(
      "create_booking_draft",
      { listing_id: "l1", check_in: "2026-08-01", check_out: "2026-08-03", guests: 4 },
      "user-1",
      "sess-1",
    );
    expect(result.is_error).toBe(true);
    expect(result.card).toBeUndefined();
  });
});

describe("submit_booking_request", () => {
  it("INSTANT mode → payment_qr card; the QR url is never in model-facing content", async () => {
    requirePhoneVerifiedMock.mockResolvedValue({ id: "user-1" });
    submitDraftMock.mockResolvedValue({ ok: true, bookingId: "bk2", code: null, mode: "INSTANT", qrUrl: "https://cdn/qr.png" });
    const result = await handleToolCall("submit_booking_request", { draft_id: "d1" }, "user-1", "sess-1");
    expect(result.is_error).toBe(false);
    expect(result.card).toMatchObject({ kind: "payment_qr", qrUrl: "https://cdn/qr.png", payUrl: "/trips/bk2/pay" });
    expect(result.content).not.toContain("https://cdn/qr.png");
  });

  it("REQUEST mode → request_sent card", async () => {
    requirePhoneVerifiedMock.mockResolvedValue({ id: "user-1" });
    submitDraftMock.mockResolvedValue({ ok: true, bookingId: "bk1", code: "UR-2608-0001", mode: "REQUEST" });
    const result = await handleToolCall("submit_booking_request", { draft_id: "d1" }, "user-1", "sess-1");
    expect(result.card).toMatchObject({ kind: "request_sent", tripUrl: "/trips/bk1" });
  });

  it("relays a Thai error when the gate fails", async () => {
    requirePhoneVerifiedMock.mockResolvedValue({ id: "user-1" });
    submitDraftMock.mockResolvedValue({ ok: false, reason: "NEEDS_CONFIRM" });
    const result = await handleToolCall("submit_booking_request", { draft_id: "d1" }, "user-1", "sess-1");
    expect(result.is_error).toBe(true);
  });

  it("refuses when the phone is unverified", async () => {
    requirePhoneVerifiedMock.mockRejectedValue(new Error("PHONE_UNVERIFIED"));
    const result = await handleToolCall("submit_booking_request", { draft_id: "d1" }, "user-1", "sess-1");
    expect(result.is_error).toBe(true);
    expect(submitDraftMock).not.toHaveBeenCalled();
  });
});
