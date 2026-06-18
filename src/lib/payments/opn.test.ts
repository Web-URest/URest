import { afterEach, describe, expect, it, vi } from "vitest";

import { createCardCharge, createPromptPayCharge, getBalance, OpnError, refundCharge, retrieveCharge } from "./opn";

/** A representative Opn charge object (PromptPay, still pending). */
const CHARGE = {
  object: "charge",
  id: "chrg_test_1",
  status: "pending",
  paid: false,
  amount: 1_290_000,
  currency: "thb",
  metadata: { bookingId: "bk1" },
  expires_at: "2026-06-17T12:15:00Z",
  source: {
    type: "promptpay",
    scannable_code: { image: { download_uri: "https://api.omise.co/qr/chrg_test_1.png" } },
  },
};

type Init = { method: string; headers: Record<string, string>; body?: string };

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastCall(mock: ReturnType<typeof vi.fn>): [string, Init] {
  return mock.mock.calls[0] as unknown as [string, Init];
}

afterEach(() => vi.unstubAllGlobals());

describe("createPromptPayCharge", () => {
  it("POSTs a form-encoded charge with Basic auth, amount, promptpay source, and booking metadata", async () => {
    const fetchMock = stubFetch(200, CHARGE);

    const charge = await createPromptPayCharge({ amountSatang: 1_290_000, bookingId: "bk1" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("https://api.omise.co/charges");
    expect(init.method).toBe("POST");
    // secret key as Basic-auth username, empty password
    expect(init.headers.Authorization).toMatch(/^Basic /);
    const decoded = Buffer.from((init.headers.Authorization ?? "").slice(6), "base64").toString("utf8");
    expect(decoded).toBe("skey_test_0000000000000000000:");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    // form body, nested params in bracket notation (URL-encoded)
    expect(init.body).toContain("amount=1290000");
    expect(init.body).toContain("currency=thb");
    expect(init.body).toContain("source%5Btype%5D=promptpay");
    expect(init.body).toContain("metadata%5BbookingId%5D=bk1");
    // parsed response is returned as a typed charge
    expect(charge.id).toBe("chrg_test_1");
    expect(charge.status).toBe("pending");
    expect(charge.source?.scannable_code?.image?.download_uri).toContain("qr/chrg_test_1.png");
  });
});

describe("createCardCharge", () => {
  it("POSTs a charge from a card token + return_uri (3DS) instead of a source", async () => {
    const fetchMock = stubFetch(200, { ...CHARGE, source: null, authorize_uri: "https://opn/3ds" });

    const charge = await createCardCharge({
      amountSatang: 500_00,
      bookingId: "bk2",
      token: "tokn_test_9",
      returnUri: "https://app/th/trips/bk2/pay",
    });

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("https://api.omise.co/charges");
    expect(init.body).toContain("amount=50000");
    expect(init.body).toContain("card=tokn_test_9");
    expect(init.body).toContain("return_uri=");
    expect(decodeURIComponent(init.body ?? "")).toContain("return_uri=https://app/th/trips/bk2/pay");
    expect(init.body).toContain("metadata%5BbookingId%5D=bk2");
    expect(init.body).not.toContain("source");
    // 3DS redirect target is surfaced for the caller
    expect(charge.authorize_uri).toBe("https://opn/3ds");
  });
});

describe("retrieveCharge", () => {
  it("GETs a charge by id with auth (used for webhook re-fetch verification)", async () => {
    const fetchMock = stubFetch(200, { ...CHARGE, status: "successful", paid: true });

    const charge = await retrieveCharge("chrg_test_1");

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("https://api.omise.co/charges/chrg_test_1");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(charge.status).toBe("successful");
    expect(charge.paid).toBe(true);
  });
});

describe("refundCharge", () => {
  it("POSTs a full refund (amount in satang) to the charge's refunds endpoint", async () => {
    const fetchMock = stubFetch(200, { object: "refund", id: "rfnd_1", amount: 50000, status: "closed" });

    const refund = await refundCharge("chrg_test_1", 500_00);

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("https://api.omise.co/charges/chrg_test_1/refunds");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(init.body).toContain("amount=50000");
    expect(refund.id).toBe("rfnd_1");
    expect(refund.status).toBe("closed");
  });
});

describe("getBalance", () => {
  it("GETs /balance with auth and returns total + available (satang)", async () => {
    const fetchMock = stubFetch(200, { object: "balance", total: 5_000_00, available: 4_200_00, currency: "thb" });

    const bal = await getBalance();

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("https://api.omise.co/balance");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(bal.total).toBe(5_000_00);
    expect(bal.available).toBe(4_200_00);
  });
});

describe("error handling", () => {
  it("throws OpnError carrying the HTTP status on a non-2xx response", async () => {
    stubFetch(401, { object: "error", code: "authentication_failure", message: "invalid key" });

    const err = await retrieveCharge("chrg_x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpnError);
    expect(err).toMatchObject({ status: 401 });
  });
});
