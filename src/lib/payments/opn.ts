/**
 * Opn (formerly Omise) REST client — the thin edge that talks to the gateway
 * (ADR-001, issue #20). U-Rest needs only three calls: create a PromptPay charge,
 * create a card charge, and retrieve a charge by id — the last is the webhook
 * re-fetch that *is* our verification (we never trust the webhook payload).
 *
 * Boring on purpose (CLAUDE.md "boring over clever"): plain `fetch`, no SDK. The
 * Opn API is form-encoded with bracket notation for nested params; amounts are
 * already integer satang (Omise's THB minor unit == satang — no conversion, rule 1).
 */
import { env } from "@/lib/env";

const OPN_API_BASE = env.OPN_API_BASE;

/** The subset of the Opn charge object U-Rest reads. */
export interface OpnCharge {
  object: "charge";
  id: string;
  status: "pending" | "successful" | "failed" | "expired" | "reversed";
  paid: boolean;
  amount: number; // satang
  currency: string;
  metadata: Record<string, unknown>;
  expires_at?: string | null;
  authorize_uri?: string | null; // 3DS redirect target for card charges
  source?: {
    type: string;
    scannable_code?: { image?: { download_uri?: string } };
  } | null;
}

/** The subset of the Opn refund object U-Rest reads. */
export interface OpnRefund {
  object: "refund";
  id: string;
  amount: number; // satang
  status: string;
}

export class OpnError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpnError";
  }
}

/** Flatten params to a form body, nesting via bracket notation (`metadata[bookingId]`). */
function toFormBody(params: Record<string, unknown>): string {
  const out = new URLSearchParams();
  const walk = (prefix: string, value: unknown): void => {
    if (value === undefined || value === null) return;
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(prefix ? `${prefix}[${k}]` : k, v);
      }
    } else {
      out.set(prefix, String(value));
    }
  };
  walk("", params);
  return out.toString();
}

/** Secret key as Basic-auth username, empty password (Omise convention). */
function authHeader(): string {
  return `Basic ${Buffer.from(`${env.OPN_SECRET_KEY}:`).toString("base64")}`;
}

async function opnRequest<T = OpnCharge>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${OPN_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(params ? { body: toFormBody(params) } : {}),
  });

  if (!res.ok) {
    const detail: unknown = await res.json().catch(() => null);
    const message =
      detail && typeof detail === "object" && "message" in detail
        ? String((detail as { message: unknown }).message)
        : res.statusText;
    throw new OpnError(res.status, message);
  }

  const body: unknown = await res.json();
  return body as T;
}

/** Create a PromptPay charge; the QR lives at `source.scannable_code.image.download_uri`. */
export function createPromptPayCharge(input: {
  amountSatang: number;
  bookingId: string;
}): Promise<OpnCharge> {
  return opnRequest("POST", "/charges", {
    amount: input.amountSatang,
    currency: "thb",
    source: { type: "promptpay" },
    metadata: { bookingId: input.bookingId },
  });
}

/**
 * Create a charge from a card token (tokenized client-side with the public key).
 * `returnUri` is where Opn returns the browser after 3DS authorization.
 */
export function createCardCharge(input: {
  amountSatang: number;
  bookingId: string;
  token: string;
  returnUri: string;
}): Promise<OpnCharge> {
  return opnRequest("POST", "/charges", {
    amount: input.amountSatang,
    currency: "thb",
    card: input.token,
    return_uri: input.returnUri,
    metadata: { bookingId: input.bookingId },
  });
}

/** Retrieve a charge by id — the authoritative status used for webhook verification. */
export function retrieveCharge(chargeId: string): Promise<OpnCharge> {
  return opnRequest("GET", `/charges/${chargeId}`);
}

/** Refund a charge (integer satang). Used for the instant-book paid-race fallback (§3.2). */
export function refundCharge(chargeId: string, amountSatang: number): Promise<OpnRefund> {
  return opnRequest<OpnRefund>("POST", `/charges/${chargeId}/refunds`, { amount: amountSatang });
}
