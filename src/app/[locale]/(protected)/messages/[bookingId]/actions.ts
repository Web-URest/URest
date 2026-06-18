"use server";

import { AuthError, requirePhoneVerified } from "@/lib/auth/guards";
import { MessagingError, sendMessage } from "@/lib/messaging/thread";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Guest or host posts a message to the booking thread (§3.5). Masking is applied in the domain module. */
export async function sendMessageAction(bookingId: string, body: string): Promise<ActionResult> {
  let userId: string;
  try {
    userId = (await requirePhoneVerified()).id;
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: "errorGeneric" };
    throw err;
  }

  try {
    await sendMessage({ bookingId, senderId: userId, body }, new Date());
    return { ok: true };
  } catch (err) {
    if (err instanceof MessagingError) {
      const error =
        err.reason === "EMPTY_BODY" ? "errorEmpty" : err.reason === "NOT_PARTICIPANT" ? "errorNotOwner" : "errorGeneric";
      return { ok: false, error };
    }
    throw err;
  }
}
