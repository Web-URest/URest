# Cron Scheduler + Booking Lifecycle Sweeps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the booking state machine's time-driven transitions (`expire`, `checkIn`, `complete`) and `purgeDeadOtps` on a single in-process node-cron minute-tick (ADR-004), via idempotent DB-row sweeps.

**Architecture:** Booking-domain sweep functions (`src/lib/booking/sweeps.ts`) query due rows and call the existing transitions per row (rule 2 — they never write status directly). A thin scheduler (`src/lib/jobs/scheduler.ts`) ticks every minute and runs all sweeps. It starts at boot from `src/instrumentation.ts` (Node runtime, skipped under test).

**Tech Stack:** TypeScript (strict), Prisma, `node-cron`, Vitest, Next.js instrumentation hook.

## Global Constraints

- **TypeScript strict; no `any`, no bare `@ts-ignore`; handle `noUncheckedIndexedAccess` undefined.** (CLAUDE.md rule 5)
- **State transitions only inside `lib/<domain>` modules** — sweeps call `expire`/`checkIn`/`complete` (lib/booking); they never write `Booking.status`/`escrowState` directly. (rule 2; `pnpm gate:status` enforces.)
- **Deadlines are DB rows swept by cron, never `setTimeout`; timestamps are UTC.** (rule 3, ADR-004)
- **Asia/Bangkok is fixed UTC+7, no DST.** `Booking.checkIn`/`checkOut` are the calendar date at UTC midnight.
- Node ≥22; pnpm; gate = `pnpm typecheck && pnpm lint && pnpm test`.
- Mock pattern: `vi.mock("@/lib/db", …)` + `vi.mock` the transition module — mirror `src/lib/booking/transitions.test.ts`.

---

### Task 1: Expiry sweeps (`sweepOverdueRequests`, `sweepOverduePayments`)

**Files:**
- Create: `src/lib/booking/sweeps.ts`
- Test: `src/lib/booking/sweeps.test.ts`

**Interfaces:**
- Consumes: `prisma.booking.findMany` (`@/lib/db`); `expire(bookingId: string, now: Date): Promise<Booking>` (`./transitions`).
- Produces: `sweepOverdueRequests(now: Date): Promise<number>`, `sweepOverduePayments(now: Date): Promise<number>`, and a private `forEachRow(ids: string[], fn: (id: string) => Promise<unknown>): Promise<number>`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/booking/sweeps.test.ts
import { BookingStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { booking: { findMany: vi.fn() } } }));
vi.mock("./transitions", () => ({ expire: vi.fn(), checkIn: vi.fn(), complete: vi.fn() }));

import { prisma } from "@/lib/db";
import { checkIn, complete, expire } from "./transitions";

import { sweepOverduePayments, sweepOverdueRequests } from "./sweeps";

const findMany = prisma.booking.findMany as unknown as Mock;
const expireMock = expire as unknown as Mock;

const NOW = new Date("2026-06-20T03:00:00.000Z");

beforeEach(() => {
  expireMock.mockResolvedValue({});
});
afterEach(() => vi.clearAllMocks());

describe("sweepOverdueRequests", () => {
  it("expires every REQUESTED booking past its respond-by", async () => {
    findMany.mockResolvedValue([{ id: "b1" }, { id: "b2" }]);

    const n = await sweepOverdueRequests(NOW);

    expect(findMany).toHaveBeenCalledWith({
      where: { status: BookingStatus.REQUESTED, respondBy: { lt: NOW } },
      select: { id: true },
    });
    expect(expireMock).toHaveBeenCalledWith("b1", NOW);
    expect(expireMock).toHaveBeenCalledWith("b2", NOW);
    expect(n).toBe(2);
  });

  it("is a no-op when nothing is due", async () => {
    findMany.mockResolvedValue([]);
    const n = await sweepOverdueRequests(NOW);
    expect(expireMock).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });

  it("isolates a per-row failure and still processes the rest", async () => {
    findMany.mockResolvedValue([{ id: "bad" }, { id: "ok" }]);
    expireMock.mockReset();
    expireMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({});
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const n = await sweepOverdueRequests(NOW);

    expect(expireMock).toHaveBeenCalledTimes(2);
    expect(n).toBe(1); // only the succeeding row counts
    spy.mockRestore();
  });
});

describe("sweepOverduePayments", () => {
  it("expires every AWAITING_PAYMENT booking past its pay-by", async () => {
    findMany.mockResolvedValue([{ id: "p1" }]);
    const n = await sweepOverduePayments(NOW);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: BookingStatus.AWAITING_PAYMENT, payBy: { lt: NOW } },
      select: { id: true },
    });
    expect(expireMock).toHaveBeenCalledWith("p1", NOW);
    expect(n).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/booking/sweeps.test.ts`
Expected: FAIL — `Failed to load url ./sweeps` (file doesn't exist).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/booking/sweeps.ts
/**
 * Booking lifecycle sweeps (ADR-004). Each finds the rows whose deadline has
 * passed and calls the matching lib/booking transition per row — the sweeps
 * never write status directly (rule 2). Per-row failures are isolated so one
 * bad row never aborts the batch. Pure functions of `now` for testability.
 */
import { BookingStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

import { expire } from "./transitions";

/** Run `fn` for each id, isolating per-row failures; returns the count that succeeded. */
async function forEachRow(
  ids: string[],
  fn: (id: string) => Promise<unknown>,
): Promise<number> {
  let done = 0;
  for (const id of ids) {
    try {
      await fn(id);
      done++;
    } catch (err) {
      console.error(`[cron] booking ${id} sweep failed:`, err instanceof Error ? err.message : err);
    }
  }
  return done;
}

/** REQUESTED past respondBy → EXPIRED. */
export async function sweepOverdueRequests(now: Date): Promise<number> {
  const rows = await prisma.booking.findMany({
    where: { status: BookingStatus.REQUESTED, respondBy: { lt: now } },
    select: { id: true },
  });
  return forEachRow(rows.map((r) => r.id), (id) => expire(id, now));
}

/** AWAITING_PAYMENT past payBy → EXPIRED. */
export async function sweepOverduePayments(now: Date): Promise<number> {
  const rows = await prisma.booking.findMany({
    where: { status: BookingStatus.AWAITING_PAYMENT, payBy: { lt: now } },
    select: { id: true },
  });
  return forEachRow(rows.map((r) => r.id), (id) => expire(id, now));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/booking/sweeps.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/booking/sweeps.ts src/lib/booking/sweeps.test.ts
git commit -m "feat(cron): booking expiry sweeps (#61)"
```

---

### Task 2: Daily check-in / checkout sweeps

**Files:**
- Modify: `src/lib/booking/sweeps.ts` (add constants + two functions)
- Test: `src/lib/booking/sweeps.test.ts` (add describes)

**Interfaces:**
- Consumes: `checkIn(bookingId: string): Promise<Booking>`, `complete(bookingId: string): Promise<Booking>` (`./transitions`).
- Produces: `CHECKIN_OFFSET_MS`, `CHECKOUT_OFFSET_MS` (number consts), `sweepDueCheckIns(now: Date): Promise<number>`, `sweepDueCheckouts(now: Date): Promise<number>`.

- [ ] **Step 1: Write the failing test** (append to `src/lib/booking/sweeps.test.ts`)

```typescript
// add to the imports from "./sweeps":
//   CHECKIN_OFFSET_MS, CHECKOUT_OFFSET_MS, sweepDueCheckIns, sweepDueCheckouts
// add to the imports from "./transitions": checkIn, complete already mocked above
const checkInMock = checkIn as unknown as Mock;
const completeMock = complete as unknown as Mock;

describe("sweepDueCheckIns", () => {
  it("checks in CONFIRMED bookings once 15:00 ICT (now − 8h) has passed", async () => {
    checkInMock.mockResolvedValue({});
    findMany.mockResolvedValue([{ id: "c1" }]);

    const n = await sweepDueCheckIns(NOW);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: BookingStatus.CONFIRMED,
        checkIn: { lte: new Date(NOW.getTime() - CHECKIN_OFFSET_MS) },
      },
      select: { id: true },
    });
    expect(checkInMock).toHaveBeenCalledWith("c1");
    expect(n).toBe(1);
  });
});

describe("sweepDueCheckouts", () => {
  it("completes CHECKED_IN bookings once 11:00 ICT (now − 4h) has passed", async () => {
    completeMock.mockResolvedValue({});
    findMany.mockResolvedValue([{ id: "d1" }]);

    const n = await sweepDueCheckouts(NOW);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: BookingStatus.CHECKED_IN,
        checkOut: { lte: new Date(NOW.getTime() - CHECKOUT_OFFSET_MS) },
      },
      select: { id: true },
    });
    expect(completeMock).toHaveBeenCalledWith("d1");
    expect(n).toBe(1);
  });
});

it("CHECKIN/CHECKOUT offsets are 8h/4h (ICT = UTC+7)", () => {
  expect(CHECKIN_OFFSET_MS).toBe(8 * 60 * 60 * 1000);
  expect(CHECKOUT_OFFSET_MS).toBe(4 * 60 * 60 * 1000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/booking/sweeps.test.ts`
Expected: FAIL — `sweepDueCheckIns is not a function` / import undefined.

- [ ] **Step 3: Write minimal implementation** (add to `src/lib/booking/sweeps.ts`)

```typescript
// add to the import from "./transitions":
import { checkIn, complete, expire } from "./transitions";

const HOUR_MS = 60 * 60 * 1000;
/** Auto check-in at 15:00 ICT = 08:00 UTC → due when checkIn ≤ now − 8h. */
export const CHECKIN_OFFSET_MS = 8 * HOUR_MS;
/** Auto checkout at 11:00 ICT = 04:00 UTC → due when checkOut ≤ now − 4h. */
export const CHECKOUT_OFFSET_MS = 4 * HOUR_MS;

/** CONFIRMED whose check-in time (15:00 ICT) has arrived → CHECKED_IN. */
export async function sweepDueCheckIns(now: Date): Promise<number> {
  const threshold = new Date(now.getTime() - CHECKIN_OFFSET_MS);
  const rows = await prisma.booking.findMany({
    where: { status: BookingStatus.CONFIRMED, checkIn: { lte: threshold } },
    select: { id: true },
  });
  return forEachRow(rows.map((r) => r.id), (id) => checkIn(id));
}

/** CHECKED_IN whose checkout time (11:00 ICT) has arrived → COMPLETED (releases escrow). */
export async function sweepDueCheckouts(now: Date): Promise<number> {
  const threshold = new Date(now.getTime() - CHECKOUT_OFFSET_MS);
  const rows = await prisma.booking.findMany({
    where: { status: BookingStatus.CHECKED_IN, checkOut: { lte: threshold } },
    select: { id: true },
  });
  return forEachRow(rows.map((r) => r.id), (id) => complete(id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/booking/sweeps.test.ts`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/booking/sweeps.ts src/lib/booking/sweeps.test.ts
git commit -m "feat(cron): daily check-in/checkout sweeps (#61)"
```

---

### Task 3: Scheduler (`runSweeps` + `startScheduler`) + node-cron dependency

**Files:**
- Modify: `package.json` (add `node-cron`, `@types/node-cron`)
- Create: `src/lib/jobs/scheduler.ts`
- Test: `src/lib/jobs/scheduler.test.ts`

**Interfaces:**
- Consumes: the four sweeps (`@/lib/booking/sweeps`); `purgeDeadOtps(): Promise<number>` (`@/lib/otp/otp`); `node-cron`'s `schedule(expr, fn)`.
- Produces: `runSweeps(now: Date): Promise<void>`, `startScheduler(): void`.

- [ ] **Step 1: Add the dependency**

Run: `pnpm add node-cron && pnpm add -D @types/node-cron`
Expected: `package.json` gains `node-cron` (dep) + `@types/node-cron` (devDep); lockfile updated.

- [ ] **Step 2: Write the failing test**

```typescript
// src/lib/jobs/scheduler.test.ts
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }));
vi.mock("@/lib/booking/sweeps", () => ({
  sweepOverdueRequests: vi.fn().mockResolvedValue(0),
  sweepOverduePayments: vi.fn().mockResolvedValue(0),
  sweepDueCheckIns: vi.fn().mockResolvedValue(0),
  sweepDueCheckouts: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/otp/otp", () => ({ purgeDeadOtps: vi.fn().mockResolvedValue(0) }));

import cron from "node-cron";
import { sweepDueCheckIns, sweepOverdueRequests } from "@/lib/booking/sweeps";
import { purgeDeadOtps } from "@/lib/otp/otp";

import { runSweeps, startScheduler } from "./scheduler";

const schedule = (cron as unknown as { schedule: Mock }).schedule;
const NOW = new Date("2026-06-20T03:00:00.000Z");

afterEach(() => vi.clearAllMocks());

describe("runSweeps", () => {
  it("runs every sweep with the supplied now", async () => {
    await runSweeps(NOW);
    expect(sweepOverdueRequests as unknown as Mock).toHaveBeenCalledWith(NOW);
    expect(sweepDueCheckIns as unknown as Mock).toHaveBeenCalledWith(NOW);
    expect(purgeDeadOtps as unknown as Mock).toHaveBeenCalledOnce();
  });

  it("isolates a failing sweep so the others still run", async () => {
    (sweepOverdueRequests as unknown as Mock).mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runSweeps(NOW);
    expect(purgeDeadOtps as unknown as Mock).toHaveBeenCalledOnce(); // reached despite earlier throw
    spy.mockRestore();
  });
});

describe("startScheduler", () => {
  it("registers a minute tick exactly once even if called twice", () => {
    startScheduler();
    startScheduler();
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0]?.[0]).toBe("* * * * *");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/lib/jobs/scheduler.test.ts`
Expected: FAIL — `Failed to load url ./scheduler`.

- [ ] **Step 4: Write minimal implementation**

```typescript
// src/lib/jobs/scheduler.ts
/**
 * In-process job scheduler (ADR-004): one node-cron minute-tick runs every
 * idempotent sweep. Deadlines are DB rows, so a restart re-derives all work.
 * Started once from src/instrumentation.ts at boot.
 */
import cron from "node-cron";

import {
  sweepDueCheckIns,
  sweepDueCheckouts,
  sweepOverduePayments,
  sweepOverdueRequests,
} from "@/lib/booking/sweeps";
import { purgeDeadOtps } from "@/lib/otp/otp";

let started = false;

/** Run all idempotent sweeps once; isolates per-sweep failures. */
export async function runSweeps(now: Date): Promise<void> {
  const jobs: Array<readonly [string, () => Promise<number>]> = [
    ["overdue-requests", () => sweepOverdueRequests(now)],
    ["overdue-payments", () => sweepOverduePayments(now)],
    ["due-check-ins", () => sweepDueCheckIns(now)],
    ["due-checkouts", () => sweepDueCheckouts(now)],
    ["purge-otps", () => purgeDeadOtps()],
  ];
  for (const [name, run] of jobs) {
    try {
      const n = await run();
      if (n > 0) console.info(`[cron] ${name}: ${n}`);
    } catch (err) {
      console.error(`[cron] ${name} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

/** Start the minute-tick scheduler once (idempotent across calls). */
export function startScheduler(): void {
  if (started) return;
  started = true;
  cron.schedule("* * * * *", () => {
    void runSweeps(new Date());
  });
  console.info("[cron] scheduler started (minute tick)");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/lib/jobs/scheduler.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/jobs/scheduler.ts src/lib/jobs/scheduler.test.ts
git commit -m "feat(cron): node-cron scheduler running all sweeps (#61)"
```

---

### Task 4: Boot wiring in `instrumentation.ts`

**Files:**
- Modify: `src/instrumentation.ts`

**Interfaces:**
- Consumes: `startScheduler()` (`@/lib/jobs/scheduler`).
- Produces: scheduler starts at server boot (Node runtime, not under test).

- [ ] **Step 1: Modify `register()`** — start the scheduler after env validation succeeds

```typescript
// src/instrumentation.ts — replace the body of register()
export async function register() {
  // Only the Node.js server runtime has the full env; skip the edge runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      await import("@/lib/env");
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
    // Start the in-process cron scheduler (ADR-004). Skip under test so vitest
    // never schedules a live tick.
    if (process.env.NODE_ENV !== "test") {
      const { startScheduler } = await import("@/lib/jobs/scheduler");
      startScheduler();
    }
  }
}
```

- [ ] **Step 2: Verify typecheck + full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green; no new failures.

- [ ] **Step 3: Verify boot wiring (manual smoke)**

Run: `pnpm db:up && pnpm dev` (needs a complete `.env`).
Expected: server logs `[cron] scheduler started (minute tick)` once at startup. Stop the server.

- [ ] **Step 4: Run the status-write gate**

Run: `pnpm gate:status`
Expected: `✓ No direct Booking.status / escrowState writes outside lib/booking + lib/ledger.` (sweeps call transitions, they don't write status.)

- [ ] **Step 5: Commit**

```bash
git add src/instrumentation.ts
git commit -m "feat(cron): start scheduler at boot via instrumentation (#61)"
```

---

## Self-review

- **Spec coverage:** expiry sweeps (Task 1) ✓, daily check-in/checkout + ICT offsets (Task 2) ✓, scheduler/node-cron/runSweeps (Task 3) ✓, instrumentation boot + skip-under-test (Task 4) ✓, `purgeDeadOtps` wired (Task 3 `runSweeps`) ✓, idempotency + per-row/per-sweep isolation tests (Tasks 1 & 3) ✓, "verified with shortened timers" = `now`-injected threshold tests ✓.
- **Placeholders:** none — every step has complete code/commands.
- **Type consistency:** `forEachRow(ids, fn)`, `sweep*(now): Promise<number>`, `runSweeps(now): Promise<void>`, `startScheduler(): void`, `CHECKIN_OFFSET_MS`/`CHECKOUT_OFFSET_MS` used identically across tasks; transition signatures match #19 (`expire(id, now)`, `checkIn(id)`, `complete(id)`, `purgeDeadOtps()`).

## Verification (end-to-end)
1. `pnpm typecheck && pnpm lint && pnpm test` — green (≈11 new tests across sweeps + scheduler).
2. `pnpm gate:status` — green.
3. `pnpm dev` — `[cron] scheduler started` logs once.
4. Open PR `feat/61-cron-scheduler` → main, `Closes #61`, copy `area:infra` + `M3` onto it. Aok squash-merges.
