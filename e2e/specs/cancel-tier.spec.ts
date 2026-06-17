import { test, expect, authenticate } from "../fixtures";

const day = 86_400_000;

test("guest cancel (Moderate, ≥14d out) refunds 100% → REVERSED + Opn refund", async ({ page, context, db }) => {
  const host = await db.seedUser();
  const guest = await db.seedUser();
  const listing = await db.seedListing({ mode: "INSTANT", tier: "MODERATE", hostId: host.id });
  await authenticate(context, guest.sessionToken);

  // Check-in 30 days out → ≥14d bucket → 100% refund regardless of the wall clock.
  const checkIn = new Date(Date.now() + 30 * day).toISOString().slice(0, 10);
  const checkOut = new Date(Date.now() + 32 * day).toISOString().slice(0, 10);

  await page.goto(`/en/listings/${listing.id}/instant?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
  await page.getByLabel(/house rules/i).check();
  await page.getByRole("button", { name: /book now/i }).click();
  await page.waitForURL("**/trips/**/pay");
  await expect(page.getByRole("img", { name: /promptpay qr/i })).toBeVisible();

  const booking = await db.prisma.booking.findFirstOrThrow({ where: { userId: guest.id } });
  await db.payViaMockAndWebhook(booking.id);
  await page.waitForURL(`**/trips/${booking.id}`);

  // Cancel from the trip detail page (two-tap arm → confirm).
  await page.getByRole("button", { name: /cancel booking/i }).click();
  await page.getByRole("button", { name: /confirm cancellation/i }).click();
  await expect.poll(async () => (await db.getBooking(booking.id))?.status).toBe("CANCELLED_BY_GUEST");

  const b = await db.getBooking(booking.id);
  expect(b?.escrowState).toBe("REVERSED");
  expect(b?.refund?.refundSatang).toBe(b?.totalSatang); // 100% at ≥14d
  expect(b?.refund?.opnRefundId).not.toBeNull(); // reached the (mock) gateway

  const refunds = (await (await fetch("http://localhost:4100/__control/refunds")).json()) as unknown[];
  expect(refunds.length).toBeGreaterThan(0);
});
