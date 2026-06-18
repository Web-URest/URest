/**
 * The concierge agent loop (#33), extracted from the SSE route so the golden
 * eval harness can drive the SAME model + prompt + tools as production.
 *
 * Pure of HTTP/SSE, conversation-persistence, and cost gates — it runs the
 * ≤5-iteration tool loop, calls `onEvent` for streaming side-effects (the route
 * forwards them to the browser; the eval ignores them), and RETURNS the collected
 * result. `handleToolCall`'s real tool effects (draft/booking writes) still happen
 * — that's intended (the eval asserts against them). The caller owns persistence
 * (saveMessage/logUsage/logUnansweredQuestion) and the cost gates.
 */
import type Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/env";

import type { ConciergeCard } from "./cards";
import { SYSTEM_PROMPT } from "./system-prompt";
import { CONCIERGE_TOOLS, handleToolCall, type ToolInput } from "./tools";

const MAX_ITERATIONS = 5;
const MAX_TOKENS = 1024;

export type ConciergeEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; name: string }
  | { type: "card"; card: ConciergeCard };

export interface ConciergeToolCall {
  name: string;
  input: ToolInput;
  result: { is_error: boolean; content: string };
  card?: ConciergeCard;
}

export interface ConciergeTurnResult {
  assistantText: string;
  toolCalls: ConciergeToolCall[];
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number };
  /** The last listing_id a tool was called with — for UnansweredQuestion logging. */
  lastToolListingId?: string;
}

export interface ConciergeTurnInput {
  /** Full model history INCLUDING the current user turn (and any confirm nudge). */
  messages: Anthropic.MessageParam[];
  userId: string | null;
  sessionId: string;
  client: Anthropic;
}

/** Run one concierge turn (model + tool loop). Side-effect-free except `onEvent` + tool effects. */
export async function runConciergeTurn(
  input: ConciergeTurnInput,
  onEvent: (event: ConciergeEvent) => void = () => {},
): Promise<ConciergeTurnResult> {
  const messages: Anthropic.MessageParam[] = [...input.messages];
  const toolCalls: ConciergeToolCall[] = [];
  let assistantText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadInputTokens = 0;
  let lastToolListingId: string | undefined;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await input.client.messages.create({
      model: env.CONCIERGE_MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: CONCIERGE_TOOLS,
      messages,
      stream: false,
    });

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    cacheReadInputTokens +=
      (response.usage as Anthropic.Usage & { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0;

    if (response.stop_reason === "end_turn") {
      for (const block of response.content) {
        if (block.type === "text") {
          assistantText += block.text;
          onEvent({ type: "text_delta", delta: block.text });
        }
      }
      break;
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        onEvent({ type: "tool_call", name: toolUse.name });
        const toolInput = toolUse.input as ToolInput;
        if (typeof toolInput.listing_id === "string" && toolInput.listing_id) {
          lastToolListingId = toolInput.listing_id;
        }
        const result = await handleToolCall(toolUse.name, toolInput, input.userId, input.sessionId);
        if (result.card) onEvent({ type: "card", card: result.card });
        toolCalls.push({
          name: toolUse.name,
          input: toolInput,
          result: { is_error: result.is_error, content: result.content },
          card: result.card,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: result.is_error,
        });
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    break; // unexpected stop reason
  }

  return {
    assistantText,
    toolCalls,
    usage: { inputTokens, outputTokens, cacheReadInputTokens },
    lastToolListingId,
  };
}
