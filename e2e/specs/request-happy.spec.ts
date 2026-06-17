import { test, expect, authenticate } from "../fixtures";

test("request → accept → pay → CONFIRMED → checkout → RELEASABLE", async ({ page, context, db }) => {
  const host = await db.seedUser();
  const guest = await db.seedUser();
  const listing = await db.seedListing({ mode: "REQUEST", hostId: host.id });
  await authenticate(context, guest.sessionToken);

  // Guest sends the request (drive the confirm screen directly with query params).
  await page.goto(`/en/listings/${listing.id}/request?checkIn=2026-08-03&checkOut=2026-08-05&guests=2`);
  await page.getByLabel(/house rules/i).check();
  await page.getByRole("button", { name: /send request/i }).click();
  await page.waitForURL("**/trips/**");

  const booking = await db.prisma.booking.findFirstOrThrow({ where: { userId: guest.id } });
  expect(booking.status).toBe("REQUESTED");

  // Host accepts (harness-driven transition) → AWAITING_PAYMENT.
  await db.acceptAs(booking.id, host.id);

  // Guest pays: open the pay screen (creates the charge), mark it paid + fire the webhook.
  await page.goto(`/en/trips/${booking.id}/pay`);
  await expect(page.getByRole("img", { name: /promptpay qr/i })).toBeVisible();
  await db.payViaMockAndWebhook(booking.id);

  // The poller advances the guest to the trip page once CONFIRMED.
  await page.waitForURL(`**/trips/${booking.id}`);
  const confirmed = await db.getBooking(booking.id);
  expect(confirmed?.status).toBe("CONFIRMED");
  expect(confirmed?.code).toMatch(/^UR-/);
  expect(confirmed?.escrowState).toBe("HELD");
  expect(confirmed?.contactUnmaskedAt).not.toBeNull();

  // Advance time past checkout → COMPLETED + escrow RELEASABLE (payout-ready).
  await db.tick("2026-08-06T05:00:00.000Z");
  const done = await db.getBooking(booking.id);
  expect(done?.status).toBe("COMPLETED");
  expect(done?.escrowState).toBe("RELEASABLE");
});
