import { test, expect, authenticate } from "../fixtures";

/** Drive a guest request through the UI; returns the created booking + the seeded host. */
async function sendRequest(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
  db: typeof import("../harness").db,
  dates: { checkIn: string; checkOut: string },
) {
  const host = await db.seedUser();
  const guest = await db.seedUser();
  const listing = await db.seedListing({ mode: "REQUEST", hostId: host.id });
  await authenticate(context, guest.sessionToken);
  await page.goto(`/en/listings/${listing.id}/request?checkIn=${dates.checkIn}&checkOut=${dates.checkOut}&guests=2`);
  await page.getByLabel(/house rules/i).check();
  await page.getByRole("button", { name: /send request/i }).click();
  await page.waitForURL("**/trips/**");
  const booking = await db.prisma.booking.findFirstOrThrow({ where: { userId: guest.id } });
  return { host, guest, booking };
}

const hour = 3_600_000;

const day = 86_400_000;
const futureDates = (offset: number) => ({
  checkIn: new Date(Date.now() + offset * day).toISOString().slice(0, 10),
  checkOut: new Date(Date.now() + (offset + 2) * day).toISOString().slice(0, 10),
});

test("host declines from the requests inbox → DECLINED + guest notified", async ({ page, context, browser, db }) => {
  const { host, guest, booking } = await sendRequest(page, context, db, futureDates(20));

  // Host signs in and declines via the real requests-inbox UI (drives declineRequest → notify).
  const hostCtx = await browser.newContext();
  await authenticate(hostCtx, host.sessionToken);
  const hostPage = await hostCtx.newPage();
  await hostPage.goto("/en/requests");
  await hostPage.getByRole("button", { name: /decline/i }).click();
  await expect.poll(async () => (await db.getBooking(booking.id))?.status).toBe("DECLINED");
  await hostCtx.close();

  expect(await db.prisma.notificationLog.count({ where: { userId: guest.id } })).toBeGreaterThan(0);
});

test("request expires when the host never responds → EXPIRED", async ({ page, context, db }) => {
  const { booking } = await sendRequest(page, context, db, futureDates(25));
  const respondBy = (await db.getBooking(booking.id))!.respondBy!;
  await db.tick(new Date(respondBy.getTime() + hour).toISOString());
  expect((await db.getBooking(booking.id))?.status).toBe("EXPIRED");
});

test("payment window lapses after accept → EXPIRED", async ({ page, context, db }) => {
  const { host, booking } = await sendRequest(page, context, db, futureDates(30));
  await db.acceptAs(booking.id, host.id);
  const payBy = (await db.getBooking(booking.id))!.payBy!;
  await db.tick(new Date(payBy.getTime() + hour).toISOString());
  expect((await db.getBooking(booking.id))?.status).toBe("EXPIRED");
});
