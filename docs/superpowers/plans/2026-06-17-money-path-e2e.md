# Money-path Playwright E2E Suite (#29) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A deterministic Playwright E2E suite over the booking money path (request/instant → pay → CONFIRMED → checkout, plus the unhappy paths), running the real app + real test Postgres with the Opn HTTP boundary faked, green locally and as a nightly CI job.

**Architecture:** `OPN_API_BASE` becomes an env var so a local mock Opn server stands in for the gateway (the webhook still re-fetches over HTTP — verification intact). A direct-DB harness seeds users + Auth.js sessions, drives host/admin-side state via `lib/booking` transitions, and ticks `runSweeps` with a controlled `now`; the guest money path is driven through the real UI. Specs assert DB/ledger state.

**Tech Stack:** Playwright (`@playwright/test`), Next.js 15 (dev server under test), Prisma + Postgres (`urest_e2e` DB), a plain-node mock Opn server, next-intl (drive the `/en` locale for readable selectors).

## Global Constraints

- **Only two app-code files change:** `src/lib/env.ts` (+ `.env.example`) and `src/lib/payments/opn.ts` (the `OPN_API_BASE` indirection). Everything else lives in `e2e/`, `playwright.config.ts`, `.github/workflows/e2e.yml`, `package.json`. **No test routes/hooks in the app bundle.**
- **Money is integer satang** (rule 1); the mock echoes satang amounts unchanged.
- **Webhook verification stays re-fetch-based** (rule 6) — the mock serves `GET /charges/:id`; nothing trusts the posted payload.
- **TS strict**, no `any`/`@ts-ignore`.
- Test env (supplied by `playwright.config.ts` `webServer.env` + `e2e/global-setup.ts`): `DATABASE_URL=postgresql://urest:urest@localhost:5432/urest_e2e`, `OPN_API_BASE=http://localhost:4100`, `NODE_ENV=test`, dummy `AUTH_SECRET`/`OPN_*`/`R2_*`/`DATA_ENCRYPTION_KEY` (copy the dummy set from `.github/workflows/ci.yml` Build step).
- Auth.js v5 **database sessions**; session cookie name `authjs.session-token` (non-secure, local HTTP).
- Drive guest steps via the UI on `/en`; drive host accept/decline + time via the harness (direct `lib/booking` calls + `runSweeps`).

## File structure

- `playwright.config.ts` — testDir `e2e/specs`, `webServer: [mock, app]`, `globalSetup`, baseURL `http://localhost:3000`, chromium project.
- `e2e/opn-mock.ts` — standalone node http mock Opn server (in-memory charge map + control endpoint).
- `e2e/global-setup.ts` — ensure `urest_e2e` exists + `prisma migrate deploy` + truncate.
- `e2e/harness.ts` — Prisma client to the test DB + `resetDb`, `seedListing`, `seedUserWithSession`, `authenticate`, `tick`, `getBooking`, `getPayment`, `payViaMockAndWebhook`, `acceptAs`/`declineAs`.
- `e2e/fixtures.ts` — Playwright `test` extended with a `db` fixture (the harness) + per-test reset.
- `e2e/specs/*.spec.ts` — one file per scenario group.
- `e2e/README.md` — coverage table + the deferred dispute-freeze note.
- Modify: `src/lib/env.ts`, `.env.example`, `src/lib/payments/opn.ts`, `src/lib/payments/opn.test.ts`, `package.json`, `.github/workflows/e2e.yml`.

---

### Task 1: `OPN_API_BASE` env indirection

**Files:** Modify `src/lib/env.ts`, `.env.example`, `src/lib/payments/opn.ts`, `src/lib/payments/opn.test.ts`

**Interfaces:** Produces `env.OPN_API_BASE: string` (default `https://api.omise.co`); `opn.ts` uses it instead of the hardcoded const.

- [ ] **Step 1: Update the opn test to assert the default base still drives the URL.** `opn.test.ts` already asserts `url === "https://api.omise.co/charges"`. Add one test that the base is the production default when the env var is unset (the existing fetch-URL assertions already prove this — add an explicit note test):

```ts
it("defaults OPN_API_BASE to the Omise production host", async () => {
  const fetchMock = stubFetch(200, CHARGE);
  await retrieveCharge("chrg_x");
  expect(lastCall(fetchMock)[0]).toBe("https://api.omise.co/charges/chrg_x");
});
```

- [ ] **Step 2: Run it (passes today via the hardcoded const, will still pass after).**

Run: `pnpm vitest run src/lib/payments/opn.test.ts`
Expected: PASS.

- [ ] **Step 3: Add the env var.** In `src/lib/env.ts`, in the Opn block:

```ts
  /** Opn API base URL — override only in E2E to point at the local mock (#29). */
  OPN_API_BASE: z.string().url().default("https://api.omise.co"),
```

- [ ] **Step 4: Use it in `opn.ts`.** Replace the hardcoded const:

```ts
import { env } from "@/lib/env";

const OPN_API_BASE = env.OPN_API_BASE;
```

- [ ] **Step 5: Document in `.env.example`.** Add under the Opn section:

```
# Opn API base — leave unset in real envs (defaults to https://api.omise.co); E2E overrides to the local mock.
# OPN_API_BASE=http://localhost:4100
```

- [ ] **Step 6: Verify the gate.**

Run: `pnpm typecheck && pnpm vitest run src/lib/payments/opn.test.ts`
Expected: PASS (default base unchanged → all existing URL assertions hold).

- [ ] **Step 7: Commit.**

```bash
git add src/lib/env.ts .env.example src/lib/payments/opn.ts src/lib/payments/opn.test.ts
git commit -m "feat(payments): make OPN_API_BASE configurable for E2E (#29)"
```

---

### Task 2: Playwright install + config + scripts + the mock Opn server

**Files:** Create `playwright.config.ts`, `e2e/opn-mock.ts`; Modify `package.json`

**Interfaces:** Produces a runnable mock on `:4100` and a Playwright config whose `webServer` boots the mock + `pnpm dev` (test env). The harness (Task 3) reaches the mock control endpoint at `http://localhost:4100/__control/...`.

- [ ] **Step 1: Install Playwright (dev).**

Run: `pnpm add -D @playwright/test && pnpm exec playwright install --with-deps chromium`
Expected: dep added; chromium downloaded.

- [ ] **Step 2: Add scripts to `package.json`.**

```json
"e2e": "playwright test",
"e2e:install": "playwright install --with-deps chromium"
```

- [ ] **Step 3: Write the mock Opn server.** `e2e/opn-mock.ts` — a plain node http server mirroring the subset `opn.ts` calls:

```ts
import { createServer } from "node:http";

type Charge = { id: string; status: string; amount: number; metadata: Record<string, unknown> };
const charges = new Map<string, Charge>();
const refunds: Array<{ chargeId: string; amount: number }> = [];
let seq = 0;

function send(res: import("node:http").ServerResponse, body: unknown) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean); // ["charges", id, ...]
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const form = new URLSearchParams(raw);
    // POST /charges
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
        object: "charge", ...charge, paid: false, currency: "thb", authorize_uri: null,
        source: { type: "promptpay", scannable_code: { image: { download_uri: `http://localhost:4100/qr/${id}.png` } } },
      });
    }
    // POST /charges/:id/refunds
    if (req.method === "POST" && parts[0] === "charges" && parts[2] === "refunds") {
      refunds.push({ chargeId: parts[1]!, amount: Number(form.get("amount") ?? 0) });
      return send(res, { object: "refund", id: `rfnd_test_${refunds.length}`, amount: Number(form.get("amount") ?? 0), status: "closed" });
    }
    // GET /charges/:id  (the webhook re-fetch)
    if (req.method === "GET" && parts[0] === "charges" && parts.length === 2) {
      const c = charges.get(parts[1]!);
      if (!c) { res.writeHead(404); return res.end("{}"); }
      return send(res, { object: "charge", ...c, paid: c.status === "successful", currency: "thb" });
    }
    // POST /__control/charges/:id/pay  (test-only: flip to successful)
    if (req.method === "POST" && parts[0] === "__control" && parts[3] === "pay") {
      const c = charges.get(parts[2]!);
      if (c) c.status = "successful";
      return send(res, { ok: true });
    }
    // GET /__control/refunds  (test assertion helper)
    if (req.method === "GET" && parts[0] === "__control" && parts[1] === "refunds") {
      return send(res, refunds);
    }
    res.writeHead(404); res.end("{}");
  });
});
server.listen(4100, () => console.log("[opn-mock] listening on :4100"));
```

- [ ] **Step 4: Write `playwright.config.ts`.**

```ts
import { defineConfig } from "@playwright/test";

const TEST_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://urest:urest@localhost:5432/urest_e2e",
  OPN_API_BASE: "http://localhost:4100",
  OPN_PUBLIC_KEY: "pkey_test_e2e",
  OPN_SECRET_KEY: "skey_test_e2e",
  AUTH_SECRET: "e2e-dummy-secret-at-least-32-characters-long",
  ADMIN_SESSION_SECRET: "e2e-dummy-admin-secret-at-least-32-chars-x",
  DATA_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  LINE_CLIENT_ID: "e2e", LINE_CLIENT_SECRET: "e2e",
  R2_ACCOUNT_ID: "e2e", R2_ACCESS_KEY_ID: "e2e", R2_SECRET_ACCESS_KEY: "e2e",
  R2_PUBLIC_BUCKET: "e2e-pub", R2_PRIVATE_BUCKET: "e2e-priv", R2_PUBLIC_BASE_URL: "https://cdn.e2e.example",
};

export default defineConfig({
  testDir: "./e2e/specs",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  fullyParallel: false, // shared test DB — serialize for determinism
  workers: 1,
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  webServer: [
    { command: "pnpm tsx e2e/opn-mock.ts", port: 4100, reuseExistingServer: !process.env.CI },
    { command: "pnpm dev", port: 3000, reuseExistingServer: !process.env.CI, env: TEST_ENV, timeout: 120_000 },
  ],
});
```

- [ ] **Step 5: Smoke the mock alone.**

Run: `pnpm tsx e2e/opn-mock.ts &` then `curl -s -X POST localhost:4100/charges -d "amount=100&metadata[bookingId]=x"` ; kill it.
Expected: JSON charge with `status:"pending"` and a `download_uri`. (On Windows, use `Invoke-RestMethod`.)

- [ ] **Step 6: Commit.**

```bash
git add playwright.config.ts e2e/opn-mock.ts package.json pnpm-lock.yaml
git commit -m "test(e2e): playwright config + mock Opn server (#29)"
```

---

### Task 3: Direct-DB harness + global setup

**Files:** Create `e2e/global-setup.ts`, `e2e/harness.ts`, `e2e/fixtures.ts`

**Interfaces:**
- Produces (consumed by all specs):
  - `db.resetDb()` — truncate booking-domain tables.
  - `db.seedListing(opts: { mode: "REQUEST"|"INSTANT"; tier?: CancellationTier; hostId: string }): Promise<{ id: string }>`
  - `db.seedUser(opts: { phoneVerified?: boolean }): Promise<{ id: string; sessionToken: string }>`
  - `authenticate(context, sessionToken)` — sets the `authjs.session-token` cookie.
  - `db.acceptAs(bookingId, hostId)` / `db.declineAs(bookingId, hostId)` — drive host side via `lib/booking` transitions.
  - `db.tick(nowIso)` — `runSweeps(new Date(nowIso))` against the test DB.
  - `db.getBooking(id)`, `db.getPayment(bookingId)`, `db.payViaMockAndWebhook(bookingId)` — mark the booking's charge paid on the mock + POST the webhook to the app, returning when CONFIRMED.

- [ ] **Step 1: `global-setup.ts`** — ensure schema on `urest_e2e`:

```ts
import { execSync } from "node:child_process";

export default function globalSetup() {
  const url = "postgresql://urest:urest@localhost:5432/urest_e2e";
  // create db if missing (ignore "already exists"), then apply migrations
  try {
    execSync(`psql "postgresql://urest:urest@localhost:5432/postgres" -c "CREATE DATABASE urest_e2e"`, { stdio: "ignore" });
  } catch { /* exists */ }
  execSync("pnpm prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
```

(If `psql` isn't on PATH in CI, create the DB via the Postgres service's default db or a `prisma db push` against a pre-created DB — the CI job (Task 7) creates `urest_e2e` via the service env.)

- [ ] **Step 2: `harness.ts`** — a Prisma client on the test DB + helpers. Key pieces:

```ts
import { PrismaClient, type CancellationTier } from "@prisma/client";
import { accept, decline } from "@/lib/booking/transitions";
import { runSweeps } from "@/lib/jobs/scheduler";

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const APP = "http://localhost:3000";
const MOCK = "http://localhost:4100";

export const db = {
  prisma,
  async resetDb() {
    await prisma.$executeRawUnsafe(
      `TRUNCATE "Booking","Payment","Refund","LedgerEntry","WebhookEvent","NotificationLog","HostStrike" RESTART IDENTITY CASCADE`,
    );
  },
  async seedUser({ phoneVerified = true } = {}) {
    const sessionToken = `e2e-${Math.random().toString(36).slice(2)}`; // Math.random ok in test harness
    const user = await prisma.user.create({
      data: {
        displayName: "E2E Guest",
        email: `e2e-${sessionToken}@example.com`,
        phoneVerifiedAt: phoneVerified ? new Date() : null,
        sessions: { create: { sessionToken, expires: new Date(Date.now() + 86_400_000) } },
      },
    });
    return { id: user.id, sessionToken };
  },
  async seedListing({ mode, tier = "MODERATE", hostId }: { mode: "REQUEST" | "INSTANT"; tier?: CancellationTier; hostId: string }) {
    // create a PUBLISHED listing owned by hostId with the standard pricing fixture
    // (region upsert + listing.create — fields per schema; see seed.ts for the shape)
    /* full field set filled in at execution against prisma/seed.ts */
    return { id: "" };
  },
  acceptAs: (bookingId: string, hostId: string) => accept(bookingId, hostId, new Date()),
  declineAs: (bookingId: string, hostId: string) => decline(bookingId, hostId),
  tick: (nowIso: string) => runSweeps(new Date(nowIso)),
  getBooking: (id: string) => prisma.booking.findUnique({ where: { id }, include: { refund: true, ledgerEntries: true } }),
  getPayment: (bookingId: string) => prisma.payment.findFirst({ where: { bookingId }, orderBy: { createdAt: "desc" } }),
  async payViaMockAndWebhook(bookingId: string) {
    const payment = await this.getPayment(bookingId);
    if (!payment) throw new Error("no payment row");
    await fetch(`${MOCK}/__control/charges/${payment.opnChargeId}/pay`, { method: "POST" });
    await fetch(`${APP}/api/webhooks/opn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: `evt_${payment.opnChargeId}`, key: "charge.complete", data: { id: payment.opnChargeId, object: "charge" } }),
    });
  },
};
```

(The `User`/`Listing` create field sets are completed at execution from `prisma/schema.prisma` + `prisma/seed.ts` — minimal valid rows. `seedListing` mirrors the seed fixture's pricing.)

- [ ] **Step 3: `fixtures.ts`** — extend Playwright `test` with a `db` fixture that resets before each test + an `authenticate` helper:

```ts
import { test as base } from "@playwright/test";
import { db } from "./harness";

export const test = base.extend<{ db: typeof db }>({
  db: async ({}, use) => {
    await db.resetDb();
    await use(db);
  },
});
export { expect } from "@playwright/test";

export async function authenticate(context: import("@playwright/test").BrowserContext, sessionToken: string) {
  await context.addCookies([{ name: "authjs.session-token", value: sessionToken, domain: "localhost", path: "/" }]);
}
```

- [ ] **Step 4: Verify the harness imports + types resolve** (no spec yet).

Run: `pnpm tsc --noEmit -p tsconfig.json` (the e2e files are under the TS project)
Expected: PASS. (If `@/` alias doesn't resolve under Playwright's runner, add `tsconfig` paths to the playwright invocation or switch the two `@/lib` imports to relative — fallback noted in the spec.)

- [ ] **Step 5: Commit.**

```bash
git add e2e/global-setup.ts e2e/harness.ts e2e/fixtures.ts
git commit -m "test(e2e): direct-DB harness (seed, auth session, sweep tick, mock pay) (#29)"
```

---

### Task 4: Request happy-path smoke (proves the pipeline)

**Files:** Create `e2e/specs/request-happy.spec.ts`

**Interfaces:** Consumes the Task 3 harness.

- [ ] **Step 1: Write the spec.**

```ts
import { test, expect, authenticate } from "../fixtures";

test("request → accept → pay → CONFIRMED → checkout → RELEASABLE", async ({ page, context, db }) => {
  const host = await db.seedUser();
  const guest = await db.seedUser();
  const listing = await db.seedListing({ mode: "REQUEST", hostId: host.id });
  await authenticate(context, guest.sessionToken);

  // Guest sends the request (drive the confirm screen directly with query params).
  await page.goto(`/en/listings/${listing.id}/request?checkIn=2026-08-01&checkOut=2026-08-03&guests=2`);
  await page.getByLabel(/house rules/i).check();
  await page.getByRole("button", { name: /send request/i }).click();
  await page.waitForURL("**/trips/**");

  const booking = await db.prisma.booking.findFirstOrThrow({ where: { userId: guest.id } });
  expect(booking.status).toBe("REQUESTED");

  // Host accepts (harness-driven) → AWAITING_PAYMENT.
  await db.acceptAs(booking.id, host.id);

  // Guest pays: open the pay screen (creates the charge), then mark paid + fire the webhook.
  await page.goto(`/en/trips/${booking.id}/pay`);
  await expect(page.getByRole("img", { name: /promptpay qr/i })).toBeVisible();
  await db.payViaMockAndWebhook(booking.id);

  // Poller advances the guest to the trip page.
  await page.waitForURL(`**/trips/${booking.id}`);
  const confirmed = await db.getBooking(booking.id);
  expect(confirmed?.status).toBe("CONFIRMED");
  expect(confirmed?.code).toMatch(/^UR-/);
  expect(confirmed?.escrowState).toBe("HELD");
  expect(confirmed?.contactUnmaskedAt).not.toBeNull();

  // Advance to checkout → COMPLETED + escrow RELEASABLE (payout-ready).
  await db.tick("2026-08-04T05:00:00.000Z");
  const done = await db.getBooking(booking.id);
  expect(done?.status).toBe("COMPLETED");
  expect(done?.escrowState).toBe("RELEASABLE");
});
```

- [ ] **Step 2: Run it (expect failures to iterate the harness/selectors).**

Run: `pnpm e2e e2e/specs/request-happy.spec.ts`
Expected: eventually PASS. Iterate `seedListing` field set + selectors (`getByLabel`/`getByRole` names from the rendered `/en` copy) until green. This task's deliverable is a GREEN smoke proving UI → action → charge → webhook → ledger → sweep end to end.

- [ ] **Step 3: Commit.**

```bash
git add e2e/specs/request-happy.spec.ts e2e/harness.ts
git commit -m "test(e2e): request happy-path → payout-ready smoke (#29)"
```

---

### Task 5: Instant happy + lifecycle-unhappy (decline, expiry, lapse)

**Files:** Create `e2e/specs/instant-happy.spec.ts`, `e2e/specs/unhappy.spec.ts`

- [ ] **Step 1: `instant-happy.spec.ts`** — INSTANT listing → `/en/listings/{id}/instant?…` → check rules → "Book now" → lands on `/pay` → `payViaMockAndWebhook` → assert `CONFIRMED` + `HELD`.

```ts
import { test, expect, authenticate } from "../fixtures";

test("instant-book → pay → CONFIRMED + HELD", async ({ page, context, db }) => {
  const host = await db.seedUser();
  const guest = await db.seedUser();
  const listing = await db.seedListing({ mode: "INSTANT", hostId: host.id });
  await authenticate(context, guest.sessionToken);

  await page.goto(`/en/listings/${listing.id}/instant?checkIn=2026-08-10&checkOut=2026-08-12&guests=2`);
  await page.getByLabel(/house rules/i).check();
  await page.getByRole("button", { name: /book now/i }).click();
  await page.waitForURL("**/trips/**/pay");

  const booking = await db.prisma.booking.findFirstOrThrow({ where: { userId: guest.id } });
  expect(booking.status).toBe("AWAITING_PAYMENT");
  await db.payViaMockAndWebhook(booking.id);
  await page.waitForURL(`**/trips/${booking.id}`);
  const confirmed = await db.getBooking(booking.id);
  expect(confirmed?.status).toBe("CONFIRMED");
  expect(confirmed?.escrowState).toBe("HELD");
});
```

- [ ] **Step 2: `unhappy.spec.ts`** — three tests:
  - **host decline:** request (UI) → `db.declineAs(booking.id, host.id)` → assert `DECLINED` + a guest `NotificationLog` row (`REQUEST_DECLINED`).
  - **request expiry:** request (UI) → `db.tick("<respondBy+1h ISO>")` → assert `EXPIRED`.
  - **payment lapse:** request → `db.acceptAs` → `db.tick("<payBy+1h ISO>")` → assert `EXPIRED`.

```ts
import { test, expect, authenticate } from "../fixtures";

async function sendRequest(page, db, mode = "REQUEST") {
  const host = await db.seedUser();
  const guest = await db.seedUser();
  const listing = await db.seedListing({ mode, hostId: host.id });
  return { host, guest, listing };
}

test("host decline → DECLINED + guest notified", async ({ page, context, db }) => {
  const { host, guest, listing } = await sendRequest(page, db);
  await authenticate(context, guest.sessionToken);
  await page.goto(`/en/listings/${listing.id}/request?checkIn=2026-09-01&checkOut=2026-09-03&guests=2`);
  await page.getByLabel(/house rules/i).check();
  await page.getByRole("button", { name: /send request/i }).click();
  await page.waitForURL("**/trips/**");
  const booking = await db.prisma.booking.findFirstOrThrow({ where: { userId: guest.id } });
  await db.declineAs(booking.id, host.id);
  expect((await db.getBooking(booking.id))?.status).toBe("DECLINED");
  expect(await db.prisma.notificationLog.count({ where: { userId: guest.id } })).toBeGreaterThan(0);
});

// request-expiry + payment-lapse: same setup; tick past the deadline; assert EXPIRED.
```

(Deadlines: `request()` sets `respondBy = now + 12h`; `accept()` sets `payBy = now + 12h`. Tick with an ISO `now` safely past those — e.g. 2 days out.)

- [ ] **Step 3: Run + green.**

Run: `pnpm e2e e2e/specs/instant-happy.spec.ts e2e/specs/unhappy.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add e2e/specs/instant-happy.spec.ts e2e/specs/unhappy.spec.ts
git commit -m "test(e2e): instant happy + decline/expiry/lapse (#29)"
```

---

### Task 6: QR regenerate + guest cancel per tier

**Files:** Create `e2e/specs/qr-regenerate.spec.ts`, `e2e/specs/cancel-tier.spec.ts`

- [ ] **Step 1: `qr-regenerate.spec.ts`** — instant-book to the pay screen; read the first `Payment.opnChargeId`; click "Regenerate QR"; assert a NEW `Payment` row exists (different `opnChargeId`) and the booking's `payBy` is unchanged.

```ts
import { test, expect, authenticate } from "../fixtures";

test("QR regenerate creates a new charge without resetting payBy", async ({ page, context, db }) => {
  const host = await db.seedUser();
  const guest = await db.seedUser();
  const listing = await db.seedListing({ mode: "INSTANT", hostId: host.id });
  await authenticate(context, guest.sessionToken);
  await page.goto(`/en/listings/${listing.id}/instant?checkIn=2026-09-10&checkOut=2026-09-12&guests=2`);
  await page.getByLabel(/house rules/i).check();
  await page.getByRole("button", { name: /book now/i }).click();
  await page.waitForURL("**/trips/**/pay");
  const booking = await db.prisma.booking.findFirstOrThrow({ where: { userId: guest.id } });
  const first = await db.getPayment(booking.id);
  const payByBefore = (await db.getBooking(booking.id))?.payBy?.toISOString();

  await page.getByRole("button", { name: /regenerate/i }).click();
  await expect.poll(async () => (await db.prisma.payment.count({ where: { bookingId: booking.id } }))).toBeGreaterThan(1);

  const latest = await db.getPayment(booking.id);
  expect(latest?.opnChargeId).not.toBe(first?.opnChargeId);
  expect((await db.getBooking(booking.id))?.payBy?.toISOString()).toBe(payByBefore);
});
```

- [ ] **Step 2: `cancel-tier.spec.ts`** — seed a MODERATE listing; create + confirm a booking with check-in **8+ days out** (→ 100% per the §3.6 table) using the harness pay flow; navigate to `/en/trips/{id}`; click cancel → confirm; assert booking `CANCELLED_BY_GUEST`, escrow `REVERSED`, a `Refund` row with the expected `refundSatang`, and the mock recorded a refund call (`GET /__control/refunds`).

```ts
import { test, expect, authenticate } from "../fixtures";

test("guest cancel (Moderate, ≥14d) refunds 100% → REVERSED + Opn refund", async ({ page, context, db }) => {
  const host = await db.seedUser();
  const guest = await db.seedUser();
  const listing = await db.seedListing({ mode: "INSTANT", tier: "MODERATE", hostId: host.id });
  await authenticate(context, guest.sessionToken);
  // Book + pay far out so the tier yields 100%.
  await page.goto(`/en/listings/${listing.id}/instant?checkIn=2026-12-01&checkOut=2026-12-03&guests=2`);
  await page.getByLabel(/house rules/i).check();
  await page.getByRole("button", { name: /book now/i }).click();
  await page.waitForURL("**/trips/**/pay");
  const booking = await db.prisma.booking.findFirstOrThrow({ where: { userId: guest.id } });
  await db.payViaMockAndWebhook(booking.id);
  await page.waitForURL(`**/trips/${booking.id}`);

  await page.getByRole("button", { name: /cancel booking/i }).click();
  await page.getByRole("button", { name: /confirm cancellation/i }).click();
  await expect.poll(async () => (await db.getBooking(booking.id))?.status).toBe("CANCELLED_BY_GUEST");

  const b = await db.getBooking(booking.id);
  expect(b?.escrowState).toBe("REVERSED");
  expect(b?.refund?.refundSatang).toBe(b?.totalSatang); // 100% at ≥14d
  const refunds = await (await fetch("http://localhost:4100/__control/refunds")).json();
  expect(refunds.length).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Run + green.**

Run: `pnpm e2e e2e/specs/qr-regenerate.spec.ts e2e/specs/cancel-tier.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add e2e/specs/qr-regenerate.spec.ts e2e/specs/cancel-tier.spec.ts
git commit -m "test(e2e): QR regenerate + guest cancel per tier (#29)"
```

---

### Task 7: Nightly CI workflow + suite README

**Files:** Create `.github/workflows/e2e.yml`, `e2e/README.md`

- [ ] **Step 1: `e2e/README.md`** — the coverage table (the 7 specs → PRD §6 checkboxes) and the explicit note: **dispute-freeze deferred to #27**; the real-sandbox charge+refund is a manual launch-gate step (PRD §6 legal list).

- [ ] **Step 2: `.github/workflows/e2e.yml`** — nightly + manual:

```yaml
name: E2E
on:
  schedule: [{ cron: "0 18 * * *" }] # nightly ~01:00 ICT
  workflow_dispatch:
jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env: { POSTGRES_USER: urest, POSTGRES_PASSWORD: urest, POSTGRES_DB: urest_e2e }
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
        env: { DATABASE_URL: "postgresql://urest:urest@localhost:5432/urest_e2e" }
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm prisma migrate deploy
        env: { DATABASE_URL: "postgresql://urest:urest@localhost:5432/urest_e2e" }
      - run: pnpm e2e
```

(The `urest_e2e` DB is created by the Postgres service `POSTGRES_DB`, so `global-setup` skips the CREATE in CI — wrap its CREATE in a try/catch, already done.)

- [ ] **Step 3: Validate the workflow YAML + the full suite locally.**

Run: `pnpm e2e` (Docker Postgres up locally with a `urest_e2e` DB)
Expected: all 7 specs PASS. Confirm the YAML parses (e.g. `gh workflow view` after push, or a YAML lint).

- [ ] **Step 4: Commit.**

```bash
git add .github/workflows/e2e.yml e2e/README.md
git commit -m "ci(e2e): nightly money-path E2E workflow + suite README (#29)"
```

---

### Task 8: Gate + final review + PR

- [ ] **Step 1: App-code gate unaffected.**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm gate:status && pnpm build`
Expected: all PASS (only `env.ts`/`opn.ts` changed in app code; `OPN_API_BASE` defaults to prod).

- [ ] **Step 2:** Final whole-branch review (read-only Explore subagent) → PR `Closes #29`, labels `area:infra` + `area:ledger-payments`, milestone M3.

## Self-Review

**Spec coverage:** §A Opn fake → Tasks 1–2; §B harness (auth/seed/sweep) → Task 3; §C scenarios → Tasks 4–6 (table maps each to a spec; dispute-freeze deferred, noted in Task 7 README); §D nightly CI → Task 7; §E app-surface-only-env/opn → Task 1 + Global Constraints. All sections covered.

**Placeholder scan:** The two intentionally-deferred-to-execution details — `seedListing`'s full field set and final selector names — are explicitly flagged as "completed at execution against `prisma/seed.ts` / the rendered `/en` copy," not silent TODOs; everything else is concrete code. (E2E selector/seed finalization against a running UI is inherent to the task; the smoke (Task 4) is the forcing function.)

**Type consistency:** the `db` harness API (`seedUser`→`{id,sessionToken}`, `seedListing`→`{id}`, `acceptAs`/`declineAs`/`tick`/`getBooking`/`getPayment`/`payViaMockAndWebhook`) is used consistently across Tasks 4–6; `authenticate(context, sessionToken)` matches the cookie `authjs.session-token`; `OPN_API_BASE` default `https://api.omise.co` matches the opn.test assertion.
