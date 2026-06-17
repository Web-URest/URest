import { test, expect, authenticate } from "../fixtures";

test("instant-book → pay → CONFIRMED + HELD + notifications fire", async ({ page, context, db }) => {
  const host = await db.seedUser();
  const guest = await db.seedUser();
  const listing = await db.seedListing({ mode: "INSTANT", hostId: host.id });
  await authenticate(context, guest.sessionToken);

  const day = 86_400_000;
  const checkIn = new Date(Date.now() + 5 * day).toISOString().slice(0, 10);
  const checkOut = new Date(Date.now() + 7 * day).toISOString().slice(0, 10);
  await page.goto(`/en/listings/${listing.id}/instant?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
  await page.getByLabel(/house rules/i).check();
  await page.getByRole("button", { name: /book now/i }).click();
  await page.waitForURL("**/trips/**/pay");

  const booking = await db.prisma.booking.findFirstOrThrow({ where: { userId: guest.id } });
  expect(booking.status).toBe("AWAITING_PAYMENT");

  // Wait for the PromptPay tab to create the charge (QR renders once the Payment row exists).
  await expect(page.getByRole("img", { name: /promptpay qr/i })).toBeVisible();
  await db.payViaMockAndWebhook(booking.id);
  await page.waitForURL(`**/trips/${booking.id}`);

  const confirmed = await db.getBooking(booking.id);
  expect(confirmed?.status).toBe("CONFIRMED");
  expect(confirmed?.escrowState).toBe("HELD");

  // §6 "notifications fire" — payment-received logs a row for the guest.
  const notes = await db.prisma.notificationLog.count({ where: { userId: guest.id } });
  expect(notes).toBeGreaterThan(0);
});
