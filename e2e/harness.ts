import type { CancellationTier } from "@prisma/client";

import { accept, decline } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { runSweeps } from "@/lib/jobs/scheduler";

/**
 * E2E harness — direct DB access for what the UI can't do: seed users + Auth.js
 * sessions, seed a PUBLISHED listing, drive host-side transitions, tick the cron
 * sweeps with a controlled `now`, and pay a booking by flipping the mock charge +
 * firing the webhook. Uses the app's own `@/lib/db` client so the transitions/
 * sweeps it imports share the same connection (all on the test DB via env).
 */
const MOCK = "http://localhost:4100";
const APP = "http://localhost:3000";
let seq = 0;

export const db = {
  prisma,

  /** Clean slate between tests; CASCADE clears listing/booking children. Region/holidays persist. */
  async resetDb(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `TRUNCATE "User","Listing","Booking","Payment","Refund","LedgerEntry","WebhookEvent","NotificationLog","HostStrike","Session" RESTART IDENTITY CASCADE`,
    );
  },

  /** A user + an Auth.js database Session; returns the cookie token for `authenticate`. */
  async seedUser({ phoneVerified = true }: { phoneVerified?: boolean } = {}): Promise<{ id: string; sessionToken: string }> {
    const n = ++seq;
    const sessionToken = `e2e-${n}-${Math.random().toString(36).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        email: `e2e-${n}@example.com`,
        displayName: `E2E User ${n}`,
        phone: `08${String(n).padStart(8, "0")}`,
        phoneVerifiedAt: phoneVerified ? new Date() : null,
      },
    });
    await prisma.session.create({
      data: { sessionToken, userId: user.id, expires: new Date(Date.now() + 86_400_000) },
    });
    return { id: user.id, sessionToken };
  },

  /** A PUBLISHED Pattaya listing owned by `hostId`; flat pricing (10,000/night) for predictable totals. */
  async seedListing({
    mode,
    tier = "MODERATE",
    hostId,
  }: {
    mode: "REQUEST" | "INSTANT";
    tier?: CancellationTier;
    hostId: string;
  }): Promise<{ id: string }> {
    const region = await prisma.region.upsert({
      where: { slug: "pattaya" },
      update: {},
      create: { slug: "pattaya", nameTh: "พัทยา", nameEn: "Pattaya", centerLat: 12.92, centerLng: 100.88, isActive: true, sortOrder: 0 },
    });
    const listing = await prisma.listing.create({
      data: {
        hostId,
        regionId: region.id,
        status: "PUBLISHED",
        title: "E2E Villa",
        description: "E2E fixture villa for the money-path suite.",
        address: "E2E address, Pattaya 20150",
        mapLat: 12.92,
        mapLng: 100.88,
        bedrooms: 3,
        beds: 4,
        baths: 2,
        maxGuests: 8,
        includedGuests: 6,
        extraGuestFeeSatang: 0,
        poolLengthM: 6,
        poolWidthM: 3,
        poolDepthM: 1.4,
        amenities: ["PRIVATE_POOL", "WIFI"],
        partyPolicy: "ASK_FIRST",
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        cashDepositSatang: 0,
        checkInTime: "15:00",
        checkOutTime: "11:00",
        baseWeekdaySatang: 10_000_00,
        baseWeekendSatang: 10_000_00,
        holidaySatang: 10_000_00,
        cancellationTier: tier,
        bookingMode: mode,
        ...(mode === "INSTANT" ? { instantAckAt: new Date() } : {}),
        publishedAt: new Date(),
      },
    });
    return { id: listing.id };
  },

  acceptAs: (bookingId: string, hostId: string) => accept(bookingId, hostId, new Date()),
  declineAs: (bookingId: string, hostId: string) => decline(bookingId, hostId),
  tick: (nowIso: string) => runSweeps(new Date(nowIso)),

  getBooking: (id: string) => prisma.booking.findUnique({ where: { id }, include: { refund: true } }),
  getPayment: (bookingId: string) => prisma.payment.findFirst({ where: { bookingId }, orderBy: { createdAt: "desc" } }),

  /** Mark the booking's latest charge paid on the mock, then POST the webhook to the app. */
  async payViaMockAndWebhook(bookingId: string): Promise<void> {
    const payment = await this.getPayment(bookingId);
    if (!payment) throw new Error(`no Payment row for booking ${bookingId}`);
    await fetch(`${MOCK}/__control/charges/${payment.opnChargeId}/pay`, { method: "POST" });
    await fetch(`${APP}/api/webhooks/opn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `evt_${payment.opnChargeId}`,
        key: "charge.complete",
        data: { id: payment.opnChargeId, object: "charge" },
      }),
    });
  },
};
