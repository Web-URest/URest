/**
 * THROWAWAY dev script (issue #20) — fire a real Opn TEST PromptPay charge so you
 * can watch the full money round-trip end to end:
 *
 *   pay the printed QR in the Opn TEST dashboard
 *     → Opn POSTs a webhook to the running app (/api/webhooks/opn)
 *       → applyChargeEvent re-fetches the charge, confirmFromWebhook moves the
 *         booking AWAITING_PAYMENT → CONFIRMED and escrow NONE → HELD.
 *
 * Run with TEST keys in .env and a running app + public webhook URL (local tunnel
 * or the Railway staging deploy) registered in the Opn dashboard. `pnpm db:up` first.
 *
 *   pnpm opn:spike                     # seed a booking + create a charge → print QR + ids
 *   pnpm opn:spike --check <bookingId> # print booking status / escrow / ledger / payment
 *
 * Self-contained on purpose: it calls Opn directly via fetch because tsx does not
 * resolve the `@/` path alias (mirrors scripts/r2-smoke.ts), so it can't import
 * src/lib/payments. The REAL lib path is exercised by the webhook when you pay.
 * NOT shipped and NOT imported by the app. Never prints the secret key (rule 9).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OPN_API_BASE = "https://api.omise.co";

interface SpikeCharge {
  id: string;
  status: string;
  expires_at?: string | null;
  source?: { scannable_code?: { image?: { download_uri?: string } } } | null;
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} — set Opn TEST keys in .env (see .env.example).`);
  return v;
}

async function createPromptPayCharge(params: Record<string, string>): Promise<SpikeCharge> {
  const auth = Buffer.from(`${need("OPN_SECRET_KEY")}:`).toString("base64");
  const res = await fetch(`${OPN_API_BASE}/charges`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const json: unknown = await res.json();
  if (!res.ok) throw new Error(`Opn ${res.status}: ${JSON.stringify(json)}`);
  return json as SpikeCharge;
}

async function check(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const ledger = await prisma.ledgerEntry.findMany({
    where: { bookingId },
    orderBy: { createdAt: "asc" },
  });
  const payments = await prisma.payment.findMany({ where: { bookingId } });

  console.log(`booking ${bookingId}`);
  console.log(`  status:  ${booking.status}`);
  console.log(`  escrow:  ${booking.escrowState}  code: ${booking.code ?? "—"}`);
  console.log(`  ledger:  ${ledger.map((e) => `${e.fromState ?? "NONE"}→${e.toState} ${e.amountSatang}`).join(", ") || "—"}`);
  console.log(`  payment: ${payments.map((p) => `${p.method} ${p.status} ${p.opnChargeId}`).join(", ") || "—"}`);
}

async function seedAndCharge(): Promise<void> {
  const listing = await prisma.listing.findFirstOrThrow({ where: { status: "PUBLISHED" } });
  const guest = await prisma.user.upsert({
    where: { email: "dev-guest@urest.local" },
    update: {},
    create: {
      email: "dev-guest@urest.local",
      displayName: "ผู้เข้าพักทดสอบ",
      phone: "0899999999",
      phoneVerifiedAt: new Date(),
    },
  });

  // ฿100 test charge. Spread check-in by the minute so repeat runs don't collide
  // with the double-booking exclusion constraint on the same listing.
  const totalSatang = 100_00;
  const offsetDays = Math.floor(Date.now() / 60_000) % 1000;
  const checkIn = new Date(Date.UTC(2027, 0, 1) + offsetDays * 86_400_000);
  const checkOut = new Date(checkIn.getTime() + 2 * 86_400_000);

  const booking = await prisma.booking.create({
    data: {
      listingId: listing.id,
      userId: guest.id,
      checkIn,
      checkOut,
      priceLines: [{ label: "spike test", amountSatang: totalSatang }],
      totalSatang,
      commissionSatang: 10_00,
      cancellationTier: "FLEXIBLE",
      status: "AWAITING_PAYMENT",
      bookingMode: "INSTANT",
      payBy: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const charge = await createPromptPayCharge({
    amount: String(totalSatang),
    currency: "thb",
    "source[type]": "promptpay",
    "metadata[bookingId]": booking.id,
  });

  await prisma.payment.create({
    data: {
      bookingId: booking.id,
      opnChargeId: charge.id,
      method: "PROMPTPAY",
      amountSatang: totalSatang,
      status: "PENDING",
      qrExpiresAt: charge.expires_at ? new Date(charge.expires_at) : null,
    },
  });

  const qr = charge.source?.scannable_code?.image?.download_uri ?? "(no QR in response)";
  console.log(`booking: ${booking.id}`);
  console.log(`charge:  ${charge.id} (${charge.status})`);
  console.log(`amount:  ${totalSatang} satang (฿${totalSatang / 100})`);
  console.log(`QR:      ${qr}`);
  console.log(`\nPay the QR in the Opn TEST dashboard, then:\n  pnpm opn:spike --check ${booking.id}`);
}

async function main(): Promise<void> {
  const checkFlag = process.argv.indexOf("--check");
  if (checkFlag !== -1) {
    const id = process.argv[checkFlag + 1];
    if (!id) throw new Error("Usage: pnpm opn:spike --check <bookingId>");
    await check(id);
    return;
  }
  await seedAndCharge();
}

main()
  .catch((e) => {
    console.error("opn-spike error:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
