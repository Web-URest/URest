import { test, expect, authenticate } from "../fixtures";

test("QR regenerate creates a new charge without resetting payBy", async ({ page, context, db }) => {
  const host = await db.seedUser();
  const guest = await db.seedUser();
  const listing = await db.seedListing({ mode: "INSTANT", hostId: host.id });
  await authenticate(context, guest.sessionToken);

  const day = 86_400_000;
  const checkIn = new Date(Date.now() + 9 * day).toISOString().slice(0, 10);
  const checkOut = new Date(Date.now() + 11 * day).toISOString().slice(0, 10);
  await page.goto(`/en/listings/${listing.id}/instant?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
  await page.getByLabel(/house rules/i).check();
  await page.getByRole("button", { name: /book now/i }).click();
  await page.waitForURL("**/trips/**/pay");
  await expect(page.getByRole("img", { name: /promptpay qr/i })).toBeVisible();

  const booking = await db.prisma.booking.findFirstOrThrow({ where: { userId: guest.id } });
  const first = await db.getPayment(booking.id);
  const payByBefore = (await db.getBooking(booking.id))?.payBy?.toISOString();

  await page.getByRole("button", { name: /regenerate/i }).click();
  await expect.poll(async () => db.prisma.payment.count({ where: { bookingId: booking.id } })).toBeGreaterThan(1);

  const latest = await db.getPayment(booking.id);
  expect(latest?.opnChargeId).not.toBe(first?.opnChargeId);
  expect((await db.getBooking(booking.id))?.payBy?.toISOString()).toBe(payByBefore); // 15-min QR ≠ 1h window
});
