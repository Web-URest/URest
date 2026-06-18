import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("./tools", () => ({ CONCIERGE_TOOLS: [], handleToolCall: vi.fn() }));

import { handleToolCall } from "./tools";

import { runConciergeTurn, type ConciergeEvent } from "./agent";

const handleToolCallMock = handleToolCall as unknown as Mock;

/** A fake Anthropic client whose `messages.create` returns scripted responses in order. */
function fakeClient(responses: unknown[]) {
  const create = vi.fn();
  for (const r of responses) create.mockResolvedValueOnce(r);
  return { client: { messages: { create } } as never, create };
}

const baseInput = (client: never) => ({
  messages: [{ role: "user" as const, content: "สวัสดี" }],
  userId: "u1",
  sessionId: "s1",
  client,
});

afterEach(() => vi.clearAllMocks());

describe("runConciergeTurn", () => {
  it("returns the assistant text + usage on a direct end_turn, emitting text_delta", async () => {
    const { client } = fakeClient([
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "สวัสดีค่ะ" }],
        usage: { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 6 },
      },
    ]);
    const events: ConciergeEvent[] = [];

    const res = await runConciergeTurn(baseInput(client), (e) => events.push(e));

    expect(res.assistantText).toBe("สวัสดีค่ะ");
    expect(res.toolCalls).toHaveLength(0);
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 4, cacheReadInputTokens: 6 });
    expect(events).toContainEqual({ type: "text_delta", delta: "สวัสดีค่ะ" });
  });

  it("runs a tool then finishes: collects the tool call, forwards userId+sessionId, sums usage", async () => {
    handleToolCallMock.mockResolvedValue({ is_error: false, content: '{"total":2}' });
    const { client } = fakeClient([
      {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "search_listings", input: { query: "วิลล่า", listing_id: "lst1" } }],
        usage: { input_tokens: 20, output_tokens: 8 },
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "เจอ 2 หลังค่ะ" }],
        usage: { input_tokens: 15, output_tokens: 5 },
      },
    ]);
    const events: ConciergeEvent[] = [];

    const res = await runConciergeTurn(baseInput(client), (e) => events.push(e));

    expect(handleToolCallMock).toHaveBeenCalledWith("search_listings", { query: "วิลล่า", listing_id: "lst1" }, "u1", "s1");
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0]).toMatchObject({ name: "search_listings", result: { is_error: false } });
    expect(res.assistantText).toBe("เจอ 2 หลังค่ะ");
    expect(res.usage.inputTokens).toBe(35); // 20 + 15
    expect(res.lastToolListingId).toBe("lst1");
    expect(events).toContainEqual({ type: "tool_call", name: "search_listings" });
  });

  it("surfaces a tool card as an onEvent + on the returned tool call (never persisted here)", async () => {
    const card = { kind: "payment_qr", bookingId: "bk2", code: null, qrUrl: "https://cdn/qr.png", payUrl: "/trips/bk2/pay" } as const;
    handleToolCallMock.mockResolvedValue({ is_error: false, content: '{"success":true}', card });
    const { client } = fakeClient([
      {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "submit_booking_request", input: { draft_id: "d1" } }],
        usage: { input_tokens: 5, output_tokens: 2 },
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "จองแล้วค่ะ" }], usage: { input_tokens: 3, output_tokens: 1 } },
    ]);
    const events: ConciergeEvent[] = [];

    const res = await runConciergeTurn(baseInput(client), (e) => events.push(e));

    expect(events).toContainEqual({ type: "card", card });
    expect(res.toolCalls[0]?.card).toEqual(card);
  });

  it("stops after MAX_ITERATIONS even if the model keeps calling tools", async () => {
    handleToolCallMock.mockResolvedValue({ is_error: false, content: "{}" });
    const toolResponse = {
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t", name: "search_listings", input: {} }],
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const { client, create } = fakeClient(Array.from({ length: 8 }, () => toolResponse));

    await runConciergeTurn(baseInput(client));

    expect(create).toHaveBeenCalledTimes(5); // capped
  });
});
