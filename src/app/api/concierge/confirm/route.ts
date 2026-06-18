import { requirePhoneVerified } from "@/lib/auth/guards";
import { confirmDraft } from "@/lib/concierge/booking";

/**
 * Mint the server-side confirmation token for a booking draft when the guest
 * taps "ยืนยันส่งคำขอ" on the in-chat card (#32, AI_CONCIERGE_SPEC §3). The token
 * is generated + stored hashed by `confirmDraft` and is NEVER returned to the
 * client or the model — the tap (gated by phone verification + draft ownership)
 * is the authorization; `submit_booking_request` validates the server-side state.
 */
export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await requirePhoneVerified();
  } catch {
    return Response.json({ ok: false, reason: "PHONE_UNVERIFIED" }, { status: 403 });
  }

  let draftId: string;
  try {
    const body = (await request.json()) as { draftId?: string };
    draftId = body.draftId ?? "";
    if (!draftId) throw new Error("empty");
  } catch {
    return Response.json({ ok: false, reason: "INVALID_REQUEST" }, { status: 400 });
  }

  const result = await confirmDraft(draftId, user.id, new Date());
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
