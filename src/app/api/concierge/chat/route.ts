import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  getOrCreateSession,
  getSessionMessages,
  getSessionTokenCount,
  logUnansweredQuestion,
  saveMessage,
} from "@/lib/concierge";
import { runConciergeTurn } from "@/lib/concierge/agent";
import {
  isDailyLimitReached,
  isKillSwitchActive,
  isTokenCeilingReached,
  logUsage,
} from "@/lib/concierge/cost";

function sseError(message: string): Response {
  const body = `data: ${JSON.stringify({ type: "error", message })}\n\n`;
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return sseError("KILL_SWITCH");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  // --- Auth (ladder step 1: any logged-in, non-suspended user) ---
  const session = await auth();
  const userId = session?.user?.id ?? null;

  // Check for suspension if logged in
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.suspendedAt || user.deletedAt) {
      return sseError("SUSPENDED");
    }
  }

  // --- Kill switch ---
  if (await isKillSwitchActive()) {
    return sseError("KILL_SWITCH");
  }

  // --- Daily cap (logged-in users only) ---
  if (userId && (await isDailyLimitReached(userId))) {
    return sseError("DAILY_LIMIT");
  }

  // --- Parse request ---
  let userMessage: string;
  let sessionId: string | undefined;
  let scopedListingId: string | undefined;
  // Set when the guest tapped Confirm on a booking-draft card. The token was
  // already minted server-side by /api/concierge/confirm; here we nudge the model
  // to call submit_booking_request with this draft_id (the token stays server-side).
  let confirmedDraftId: string | undefined;

  try {
    const body = (await request.json()) as {
      message: string;
      sessionId?: string;
      scopedListingId?: string;
      confirmedDraftId?: string;
    };
    userMessage = body.message?.trim();
    sessionId = body.sessionId;
    scopedListingId = body.scopedListingId;
    confirmedDraftId = body.confirmedDraftId;
    if (!userMessage) throw new Error("empty");
  } catch {
    return sseError("INVALID_REQUEST");
  }

  // --- Session ownership (IDOR guard) ---
  // Anonymous users cannot supply a sessionId — no way to prove ownership without
  // a signed cookie. Logged-in users must own the session they reference.
  let resolvedSessionId: string;
  if (sessionId) {
    // Anonymous callers can never resume a session — no signed cookie means no
    // ownership proof. null !== null is false in JS, so we must guard explicitly.
    if (!userId) return sseError("FORBIDDEN");
    const existing = await prisma.conciergeSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });
    if (!existing || existing.userId == null || existing.userId !== userId) {
      return sseError("FORBIDDEN");
    }
    resolvedSessionId = existing.id;
  } else {
    resolvedSessionId = await getOrCreateSession(userId, scopedListingId);
  }

  // --- Token ceiling check ---
  const sessionTokens = await getSessionTokenCount(resolvedSessionId);
  if (isTokenCeilingReached(sessionTokens)) {
    return sseError("TOKEN_CEILING");
  }

  // --- Persist user message ---
  await saveMessage(resolvedSessionId, "user", userMessage);

  // --- Build message history for Anthropic ---
  const history = await getSessionMessages(resolvedSessionId);
  // Only user/assistant turns go to the model. "card" rows (booking draft / QR)
  // are UI side-effects persisted for the transcript — they must NEVER enter the
  // model context (they'd break the role cast + leak the QR url, AC#4).
  const anthropicMessages: Anthropic.MessageParam[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // On a confirm tap, nudge the model to submit THIS draft — appended to the last
  // user turn (a separate turn would break user/assistant alternation). The
  // draft_id is not secret; the confirmation token is never included.
  if (confirmedDraftId) {
    const last = anthropicMessages[anthropicMessages.length - 1];
    if (last && last.role === "user" && typeof last.content === "string") {
      last.content += `\n\n[ระบบ] ผู้ใช้กดยืนยันการจองแล้ว — เรียก submit_booking_request ด้วย draft_id: ${confirmedDraftId}`;
    }
  }

  // --- SSE streaming response ---
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      }

      // Emit sessionId so the client can track it
      send({ type: "session_id", sessionId: resolvedSessionId });

      try {
        // The model + tool loop (extracted to lib/concierge/agent so the eval
        // harness drives the same path, #33). SSE events flow through `send`;
        // persistence + the cost gates are this route's job, below.
        const turn = await runConciergeTurn(
          {
            messages: anthropicMessages,
            userId,
            sessionId: resolvedSessionId,
            client,
          },
          (e) => send(e),
        );

        // Persist the assistant reply + any card side-effects (cards are persisted
        // for the transcript but were never put in the model history — AC#4).
        if (turn.assistantText) {
          await saveMessage(resolvedSessionId, "assistant", turn.assistantText);
        }
        for (const call of turn.toolCalls) {
          if (call.card) {
            await saveMessage(resolvedSessionId, "card", JSON.stringify(call.card));
          }
        }

        // Refusal detection — if the model fired the closed-world refusal script,
        // write an UnansweredQuestion row so the admin growth loop (§5.7) can surface
        // it to the host as a FAQ suggestion.
        if (turn.assistantText.includes("ไม่มีข้อมูลส่วนนี้ในประกาศ")) {
          const listingIdForLog = turn.lastToolListingId ?? (scopedListingId ?? undefined);
          await logUnansweredQuestion(resolvedSessionId, userMessage, listingIdForLog).catch(() => {
            // Non-fatal — don't interrupt the SSE response if this fails
          });
        }

        await logUsage(
          resolvedSessionId,
          turn.usage.inputTokens,
          turn.usage.outputTokens,
          turn.usage.cacheReadInputTokens,
        );

        send({ type: "done" });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "unknown";
        console.error("[concierge] stream error:", msg);
        send({
          type: "error",
          message: "ANTHROPIC_ERROR",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
