import { test, expect, authenticate } from "../fixtures";

const day = 86_400_000;

test("request → accept → pay → CONFIRMED → checkout → RELEASABLE", async ({ page, context, db }) => {
  const host = await db.seedUser();
  const guest = await db.seedUser();
  const listing = await db.seedListing({ mode: "REQUEST", hostId: host.id });
  await authenticate(context, guest.sessionToken);

  // Relative dates so the spec never rots; the checkout tick is derived from checkOut.
  const checkOutMs = Date.now() + 7 * day;
  const checkIn = new Date(Date.now() + 5 * day).toISOString().slice(0, 10);
  const checkOut = new Date(checkOutMs).toISOString().slice(0, 10);

  // Guest sends the request (drive the confirm screen directly with query params).
  await page.goto(`/en/listings/${listing.id}/request?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
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

  // Advance time well past checkout → COMPLETED + escrow RELEASABLE (payout-ready).
  await db.tick(new Date(checkOutMs + 2 * day).toISOString());
  const done = await db.getBooking(booking.id);
  expect(done?.status).toBe("COMPLETED");
  expect(done?.escrowState).toBe("RELEASABLE");
});
