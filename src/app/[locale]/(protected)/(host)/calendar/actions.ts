"use server";

import { AuthError, requireHostEligible } from "@/lib/auth/guards";
import { addCalendarBlock, removeCalendarBlock } from "@/lib/listing/calendar";
import { ListingError } from "@/lib/listing/transitions";
import { calendarBlockSchema } from "@/lib/listing/validation";

/**
 * Host calendar block actions (PRODUCT_FLOWS §4.2 ปฏิทิน). Thin authenticated
 * entry points: resolve the host from the session, delegate to `lib/listing`
 * (CLAUDE.md rule 2), return a `Host.*` i18n key on failure.
 */

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

function errorKey(e: unknown): string {
  if (e instanceof AuthError) return "errorGeneric";
  if (e instanceof ListingError) {
    switch (e.reason) {
      case "NOT_FOUND":
        return "errorNotFound";
      case "NOT_OWNER":
        return "errorNotOwner";
      default:
        return "errorGeneric";
    }
  }
  return "errorGeneric";
}

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

/**
 * Toggle a single day: block it (`blockId` null) or unblock the covering block.
 * The host calendar creates single-day blocks; unblocking removes whatever block
 * covers the tapped date.
 */
export async function toggleBlockAction(
  listingId: string,
  ymd: string,
  blockId: string | null,
): Promise<ActionResult> {
  try {
    const user = await requireHostEligible();

    if (blockId) {
      await removeCalendarBlock(blockId, user.id);
      return { ok: true };
    }

    const parsed = calendarBlockSchema.safeParse({ startDate: ymd, endDate: ymd });
    if (!parsed.success) return { ok: false, error: "errorGeneric" };
    await addCalendarBlock(listingId, user.id, toDate(ymd), toDate(ymd));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}
