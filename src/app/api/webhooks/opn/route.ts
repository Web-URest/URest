/**
 * Opn payment webhook (issue #20, rule 6). Opn POSTs charge events here.
 *
 * Security model is RE-FETCH, not signatures (ADR-001): we never trust this
 * payload — `applyChargeEvent` re-fetches the charge from Opn with the secret key
 * and acts on the authoritative status. So this handler only needs to find the
 * event id + charge id and delegate.
 *
 * Responses: 400 on a malformed body; 200 for anything we handled, no-op'd, or
 * don't care about (so Opn stops retrying); 500 only on a genuine processing
 * error (so Opn DOES retry). Middleware excludes /api, so the raw body is intact.
 */
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { applyChargeEvent } from "@/lib/payments/charge";

const eventSchema = z.object({
  id: z.string(),
  key: z.string().optional(),
  data: z.object({
    id: z.string(),
    object: z.string().optional(),
  }),
});

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) return new Response("invalid event", { status: 400 });
  const event = parsed.data;

  // Only charge events drive escrow; ignore everything else (refunds, etc.).
  if (event.data.object && event.data.object !== "charge") {
    return Response.json({ ok: true, ignored: "non-charge event" });
  }

  try {
    const outcome = await applyChargeEvent(
      event.id,
      event.data.id,
      json as Prisma.InputJsonValue,
      new Date(),
    );
    return Response.json({ ok: true, outcome: outcome.kind });
  } catch (err) {
    // No secrets/keys/URLs logged (rule 9) — just the failure reason.
    console.error("[opn webhook] processing error:", err instanceof Error ? err.message : err);
    return new Response("processing error", { status: 500 });
  }
}
