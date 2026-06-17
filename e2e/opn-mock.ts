/**
 * Mock Opn gateway for the E2E suite (#29). Mirrors the subset `src/lib/payments/opn.ts`
 * calls — create/retrieve charge + refund — over plain node http, holding charge state in
 * memory. The app's webhook still RE-FETCHES `GET /charges/:id` from here (the real
 * verification path), so nothing about the security model is bypassed; the suite just
 * controls the charge's status deterministically via `POST /__control/charges/:id/pay`.
 */
import { createServer, type ServerResponse } from "node:http";

type Charge = { id: string; status: string; amount: number; metadata: Record<string, unknown> };
const charges = new Map<string, Charge>();
const refunds: Array<{ chargeId: string; amount: number }> = [];
let seq = 0;

function send(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const form = new URLSearchParams(raw);

    // POST /charges — create
    if (req.method === "POST" && parts[0] === "charges" && parts.length === 1) {
      const id = `chrg_test_${++seq}`;
      const charge: Charge = {
        id,
        status: "pending",
        amount: Number(form.get("amount") ?? 0),
        metadata: { bookingId: form.get("metadata[bookingId]") ?? "" },
      };
      charges.set(id, charge);
      return send(res, {
        object: "charge",
        ...charge,
        paid: false,
        currency: "thb",
        authorize_uri: null,
        source: { type: "promptpay", scannable_code: { image: { download_uri: `http://localhost:4100/qr/${id}.png` } } },
      });
    }

    // POST /charges/:id/refunds
    if (req.method === "POST" && parts[0] === "charges" && parts[2] === "refunds") {
      const amount = Number(form.get("amount") ?? 0);
      refunds.push({ chargeId: parts[1] ?? "", amount });
      return send(res, { object: "refund", id: `rfnd_test_${refunds.length}`, amount, status: "closed" });
    }

    // GET /charges/:id — the webhook re-fetch (authoritative status)
    if (req.method === "GET" && parts[0] === "charges" && parts.length === 2) {
      const c = charges.get(parts[1] ?? "");
      if (!c) {
        res.writeHead(404);
        return res.end("{}");
      }
      return send(res, { object: "charge", ...c, paid: c.status === "successful", currency: "thb" });
    }

    // POST /__control/charges/:id/pay — test-only: flip to successful
    if (req.method === "POST" && parts[0] === "__control" && parts[1] === "charges" && parts[3] === "pay") {
      const c = charges.get(parts[2] ?? "");
      if (c) c.status = "successful";
      return send(res, { ok: true });
    }

    // GET /__control/refunds — test assertion helper
    if (req.method === "GET" && parts[0] === "__control" && parts[1] === "refunds") {
      return send(res, refunds);
    }

    res.writeHead(404);
    res.end("{}");
  });
});

server.listen(4100, () => console.log("[opn-mock] listening on :4100"));
