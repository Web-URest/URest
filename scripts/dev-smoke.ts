// Dev-only end-to-end smoke of the #17 domain logic against the REAL database.
// Run: node --env-file=.env --import tsx scripts/dev-smoke.ts
import { prisma } from "@/lib/db";
import { editLocation, editOperational, setBookingMode } from "@/lib/listing/edit";
import { addCalendarBlock, getHostCalendar, removeCalendarBlock } from "@/lib/listing/calendar";
import { createFaqEntry, deleteFaqEntry, setFaqStatus } from "@/lib/listing/faq";

const ok = (n: string, c: boolean) => console.log(`${c ? "✅" : "❌"} ${n}`);

async function main() {
const user = await prisma.user.findUniqueOrThrow({ where: { email: "dev-host@urest.local" } });
const l = await prisma.listing.findFirstOrThrow({
  where: { hostId: user.id, status: "PUBLISHED" },
});
const hostId = user.id;
const origPrice = l.baseWeekdaySatang;

// 1. Operational edit (price) stays PUBLISHED
await editOperational(l.id, hostId, { baseWeekdaySatang: origPrice + 100 });
let row = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
ok("price edit saved + status stays PUBLISHED", row.baseWeekdaySatang === origPrice + 100 && row.status === "PUBLISHED");
await editOperational(l.id, hostId, { baseWeekdaySatang: origPrice }); // restore

// 2. Calendar block round-trip
const d = new Date("2027-03-15T00:00:00.000Z");
const block = await addCalendarBlock(l.id, hostId, d, d, "smoke");
let blocks = await getHostCalendar(l.id, hostId, new Date("2027-01-01T00:00:00.000Z"));
ok("calendar block created + listed", blocks.some((b) => b.id === block.id));
await removeCalendarBlock(block.id, hostId);
blocks = await getHostCalendar(l.id, hostId, new Date("2027-01-01T00:00:00.000Z"));
ok("calendar block removed", !blocks.some((b) => b.id === block.id));

// 3. FAQ CRUD
const faq = await createFaqEntry(l.id, hostId, { question: "smoke q", answer: "smoke a" });
await setFaqStatus(faq.id, hostId, "DRAFT");
const faqRow = await prisma.listingFaqEntry.findUniqueOrThrow({ where: { id: faq.id } });
ok("faq create + status→DRAFT", faqRow.status === "DRAFT" && faqRow.source === "HOST");
await deleteFaqEntry(faq.id, hostId);
const gone = await prisma.listingFaqEntry.findUnique({ where: { id: faq.id } });
ok("faq deleted", gone === null);

// 4. Ownership rejection (someone else's id)
let rejected = false;
try {
  await editOperational(l.id, "not-the-owner", { title: "hack" });
} catch (e) {
  rejected = (e as { reason?: string }).reason === "NOT_OWNER";
}
ok("non-owner edit rejected (NOT_OWNER)", rejected);

// 5. Location edit re-review (→ PENDING_REVIEW), then restore for re-testing
await editLocation(l.id, hostId, { address: "smoke addr", mapLat: l.mapLat, mapLng: l.mapLng });
row = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
ok("location edit flips → PENDING_REVIEW", row.status === "PENDING_REVIEW");
await prisma.listing.update({
  where: { id: l.id },
  data: { status: "PUBLISHED", address: l.address },
}); // restore so the listing stays editable for manual testing

// 6. setBookingMode ack gate
let ackGate = false;
try {
  await setBookingMode(l.id, hostId, "INSTANT", false);
} catch (e) {
  ackGate = (e as { reason?: string }).reason === "INSTANT_ACK_REQUIRED";
}
ok("instant mode without ack rejected", ackGate || l.instantAckAt != null);

await prisma.$disconnect();
}

main();
