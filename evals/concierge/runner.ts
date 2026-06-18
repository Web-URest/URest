import Anthropic from "@anthropic-ai/sdk";

import { runConciergeTurn } from "@/lib/concierge/agent";
import { confirmDraft } from "@/lib/concierge/booking";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

import { seedEvalFixtures, type EvalFixtures } from "../seed";

/** A turn is either a plain user message or a "tap Confirm then send" step (booking flow). */
export type EvalTurn = { user: string } | { confirm: string };

export interface EvalCase {
  id: string;
  category: "fact" | "refuse" | "booking" | "injection";
  /** Fixture villa key the session is scoped to (jomtien | naklua | pattayaSouth). */
  listing?: string;
  turns: EvalTurn[];
  /** fact: substring(s) expected in the final reply. */
  fact?: string | string[];
  /** Optional LLM-judge for phrasing-tolerant fact checks. */
  judge?: { question: string; expected: string };
  /** Tool names that must appear, in order (subsequence). */
  expectTools?: string[];
  /** Expected booking outcome after a submit. */
  expectStatus?: "requested" | "awaiting_payment";
  /** The booking must NOT be created (e.g. submit-without-confirm). */
  expectNoBooking?: boolean;
  /** Injection: overwrite the scoped listing's host content for this case (restored after). */
  inject?: { description: string };
}

export interface CaseRun {
  finalText: string;
  allText: string;
  toolNames: string[];
  submit?: { success: boolean; status?: string; bookingCode?: string | null };
}

export interface EvalContext {
  client: Anthropic;
  fixtures: EvalFixtures;
}

/** Build the shared client + ensure fixtures. Throws clearly if no API key is set. */
export async function createEvalContext(): Promise<EvalContext> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required to run pnpm eval:concierge (set it locally or as a CI secret).");
  }
  const fixtures = await seedEvalFixtures();
  return { client: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), fixtures };
}

/** Drive one case end-to-end through the real agent against the seeded test DB. */
export async function runCase(ctx: EvalContext, c: EvalCase): Promise<CaseRun> {
  const listingId = c.listing ? ctx.fixtures.listings[c.listing] : undefined;

  // Injection cases: temporarily overwrite the listing's host content, restore after.
  let restore: string | null = null;
  if (c.inject && listingId) {
    const before = await prisma.listing.findUnique({ where: { id: listingId }, select: { description: true } });
    restore = before?.description ?? "";
    await prisma.listing.update({ where: { id: listingId }, data: { description: c.inject.description } });
  }

  try {
    const session = await prisma.conciergeSession.create({
      data: { userId: ctx.fixtures.guestId, scopedListingId: listingId },
    });

    const messages: Anthropic.MessageParam[] = [];
    const toolNames: string[] = [];
    const assistantTexts: string[] = [];
    let lastDraftId: string | undefined;
    let submit: CaseRun["submit"];

    for (const turn of c.turns) {
      let content: string;
      if ("confirm" in turn) {
        if (!lastDraftId) throw new Error(`case ${c.id}: confirm turn with no prior booking_draft`);
        await confirmDraft(lastDraftId, ctx.fixtures.guestId, new Date()); // the server-side tap
        // Mirror the route's confirm nudge (draft_id only — never a token).
        content = `${turn.confirm}\n\n[ระบบ] ผู้ใช้กดยืนยันการจองแล้ว — เรียก submit_booking_request ด้วย draft_id: ${lastDraftId}`;
      } else {
        content = turn.user;
      }

      messages.push({ role: "user", content });
      const result = await runConciergeTurn({
        messages,
        userId: ctx.fixtures.guestId,
        sessionId: session.id,
        client: ctx.client,
      });
      messages.push({ role: "assistant", content: result.assistantText || "(no text)" });
      assistantTexts.push(result.assistantText);

      for (const call of result.toolCalls) {
        toolNames.push(call.name);
        if (call.card?.kind === "booking_draft") lastDraftId = call.card.draftId;
        if (call.name === "submit_booking_request" && !call.result.is_error) {
          try {
            const parsed = JSON.parse(call.result.content) as { success?: boolean; status?: string; booking_code?: string | null };
            submit = { success: parsed.success === true, status: parsed.status, bookingCode: parsed.booking_code ?? null };
          } catch {
            /* leave submit undefined */
          }
        }
      }
    }

    return {
      finalText: assistantTexts[assistantTexts.length - 1] ?? "",
      allText: assistantTexts.join("\n"),
      toolNames,
      submit,
    };
  } finally {
    if (c.inject && listingId && restore !== null) {
      await prisma.listing.update({ where: { id: listingId }, data: { description: restore } });
    }
  }
}
