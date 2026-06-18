import { prisma } from "@/lib/db";

/**
 * Eval-only fixtures (#33): a phone-verified test guest + two saved villas, on
 * top of the 3 villas the core seed (`prisma/seed.ts`) already creates. Idempotent.
 * The booking-flow cases act as this guest (submit_booking_request needs phone
 * verification); the saved-list cases read these saves.
 */

export const EVAL_GUEST_EMAIL = "eval-guest@urest.local";

/** Stable case keys → the seeded villa titles (prisma/seed.ts). */
export const VILLA_TITLES: Record<string, string> = {
  jomtien: "บ้านพูลวิลล่าทดสอบ จอมเทียน", // REQUEST mode, 4-bed
  naklua: "บ้านริมสวน นาเกลือ", // INSTANT mode, pet-friendly
  pattayaSouth: "วิลล่าลักชัวรี่ พัทยาใต้", // INSTANT mode, luxury
};

const SAVED_KEYS = ["jomtien", "naklua"] as const;

export interface EvalFixtures {
  guestId: string;
  /** case key → listing id (resolved from the seeded villas). */
  listings: Record<string, string>;
}

/** Ensure the eval fixtures exist and return their ids. Run AFTER the core seed. */
export async function seedEvalFixtures(now: Date = new Date()): Promise<EvalFixtures> {
  const guest = await prisma.user.upsert({
    where: { email: EVAL_GUEST_EMAIL },
    update: { phoneVerifiedAt: now },
    create: {
      email: EVAL_GUEST_EMAIL,
      displayName: "ผู้ทดสอบ (eval)",
      phone: "0800000001",
      phoneVerifiedAt: now,
    },
  });

  const listings: Record<string, string> = {};
  for (const [key, title] of Object.entries(VILLA_TITLES)) {
    const villa = await prisma.listing.findFirst({ where: { title }, select: { id: true } });
    if (!villa) {
      throw new Error(`Eval fixture villa missing: "${title}" — run the core seed (pnpm db:seed) first`);
    }
    listings[key] = villa.id;
  }

  for (const key of SAVED_KEYS) {
    const listingId = listings[key]!;
    await prisma.savedVilla.upsert({
      where: { userId_listingId: { userId: guest.id, listingId } },
      update: {},
      create: { userId: guest.id, listingId },
    });
  }

  return { guestId: guest.id, listings };
}
