import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/payments/charge", () => ({ applyChargeEvent: vi.fn() }));

import { applyChargeEvent } from "@/lib/payments/charge";

import { POST } from "./route";

const apply = applyChargeEvent as unknown as Mock;

function post(body: string): Promise<Response> {
  return POST(new Request("http://localhost/api/webhooks/opn", { method: "POST", body }));
}

const chargeEvent = {
  object: "event",
  id: "evnt_1",
  key: "charge.complete",
  data: { object: "charge", id: "chrg_1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  apply.mockReset();
  apply.mockResolvedValue({ kind: "confirmed", bookingId: "bk1" });
});

describe("POST /api/webhooks/opn", () => {
  it("400s on a non-JSON body (no processing)", async () => {
    const res = await post("not json");
    expect(res.status).toBe(400);
    expect(apply).not.toHaveBeenCalled();
  });

  it("400s on a JSON body missing the event/charge shape", async () => {
    const res = await post(JSON.stringify({ hello: "world" }));
    expect(res.status).toBe(400);
    expect(apply).not.toHaveBeenCalled();
  });

  it("dispatches a charge event to applyChargeEvent and returns 200", async () => {
    const res = await post(JSON.stringify(chargeEvent));
    expect(res.status).toBe(200);
    expect(apply).toHaveBeenCalledWith("evnt_1", "chrg_1", chargeEvent, expect.any(Date));
  });

  it("returns 200 for an ignored outcome (replays/duplicates never trigger an Opn retry)", async () => {
    apply.mockResolvedValue({ kind: "ignored", bookingId: "bk1" });
    const res = await post(JSON.stringify(chargeEvent));
    expect(res.status).toBe(200);
  });

  it("ignores non-charge events (200) without re-fetching", async () => {
    const res = await post(
      JSON.stringify({ object: "event", id: "evnt_2", key: "refund.create", data: { object: "refund", id: "rfnd_1" } }),
    );
    expect(res.status).toBe(200);
    expect(apply).not.toHaveBeenCalled();
  });

  it("500s when processing throws, so Opn retries", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    apply.mockRejectedValue(new Error("db down"));
    const res = await post(JSON.stringify(chargeEvent));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
