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
import { CONCIERGE_TOOLS, handleToolCall, type ToolInput } from "@/lib/concierge/tools";
import { SYSTEM_PROMPT } from "@/lib/concierge/system-prompt";
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

  try {
    const body = (await request.json()) as {
      message: string;
      sessionId?: string;
      scopedListingId?: string;
    };
    userMessage = body.message?.trim();
    sessionId = body.sessionId;
    scopedListingId = body.scopedListingId;
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
  // The last message is the one we just saved; include all as the history
  const anthropicMessages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

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

      let assistantText = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadInputTokens = 0;
      // Track the listing_id touched in this turn for UnansweredQuestion logging
      let lastToolListingId: string | undefined;

      try {
        // Tool-use loop (max 5 iterations to prevent runaway)
        for (let iteration = 0; iteration < 5; iteration++) {
          const response = await client.messages.create({
            model: env.CONCIERGE_MODEL,
            max_tokens: 1024,
            system: [
              {
                type: "text",
                text: SYSTEM_PROMPT,
                // Cache the frozen system prompt (§8)
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: CONCIERGE_TOOLS,
            messages: anthropicMessages,
            stream: false, // tool loop; we stream text separately below
          });

          inputTokens += response.usage.input_tokens;
          outputTokens += response.usage.output_tokens;
          cacheReadInputTokens +=
            (
              response.usage as Anthropic.Usage & {
                cache_read_input_tokens?: number;
              }
            ).cache_read_input_tokens ?? 0;

          if (response.stop_reason === "end_turn") {
            // Collect text blocks
            for (const block of response.content) {
              if (block.type === "text") {
                assistantText += block.text;
                send({ type: "text_delta", delta: block.text });
              }
            }
            break;
          }

          if (response.stop_reason === "tool_use") {
            // Process all tool calls
            const toolUseBlocks = response.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
            );

            // Add assistant turn with tool calls to history
            anthropicMessages.push({
              role: "assistant",
              content: response.content,
            });

            // Execute tools and collect results
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const toolUse of toolUseBlocks) {
              send({ type: "tool_call", name: toolUse.name });
              const toolInput = toolUse.input as ToolInput;
              // Track which listing the model is querying (for UnansweredQuestion)
              if (
                typeof toolInput.listing_id === "string" &&
                toolInput.listing_id
              ) {
                lastToolListingId = toolInput.listing_id;
              }
              const result = await handleToolCall(toolUse.name, toolInput, userId);
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: result.content,
                is_error: result.is_error,
              });
            }

            // Add tool results turn
            anthropicMessages.push({ role: "user", content: toolResults });
            continue;
          }

          // Unexpected stop reason
          break;
        }

        // Persist assistant message
        if (assistantText) {
          await saveMessage(resolvedSessionId, "assistant", assistantText);
        }

        // Refusal detection — if the model fired the closed-world refusal script,
        // write an UnansweredQuestion row so the admin growth loop (§5.7) can surface
        // it to the host as a FAQ suggestion. The listingId comes from the tool call
        // that prompted the refusal, or from the session's scoped listing.
        if (assistantText.includes("ไม่มีข้อมูลส่วนนี้ในประกาศ")) {
          const listingIdForLog =
            lastToolListingId ??
            (scopedListingId ?? undefined);
          await logUnansweredQuestion(
            resolvedSessionId,
            userMessage,
            listingIdForLog,
          ).catch(() => {
            // Non-fatal — don't interrupt the SSE response if this fails
          });
        }

        // Log usage
        await logUsage(
          resolvedSessionId,
          inputTokens,
          outputTokens,
          cacheReadInputTokens,
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
