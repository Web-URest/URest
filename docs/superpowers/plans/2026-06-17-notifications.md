# Notifications Dispatch Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `src/lib/notifications/` — `notify()` fans a notification to email (always) + LINE (priority events, linked users) per ADR-005, logging every send in `NotificationLog`, with a cron-driven retry sweep.

**Architecture:** Per-channel driver interfaces (`EmailDriver`/`LineDriver`) with console drivers (dev/test) + Resend/LINE drivers (prod), chosen by pure selection functions — mirroring the OTP `selectSmsDriver` pattern. `notify()` renders a template, writes a `NotificationLog` row per channel (QUEUED→SENT/FAILED), and never throws; `sweepFailedNotifications()` (wired into slice-1's cron) re-dispatches FAILED rows.

**Tech Stack:** TypeScript (strict), Prisma, `fetch` (Resend + LINE HTTP), Vitest, node-cron (existing).

## Global Constraints

- **TypeScript strict; no `any`/`@ts-ignore`; handle `noUncheckedIndexedAccess`.** (rule 5)
- **Thai-first** notification copy (rule 7) — template bodies are in-code (not `messages/*.json`, which are UI strings).
- **No schema change** — `NotificationLog` + `NotificationChannel{LINE,EMAIL}` + `NotificationStatus{QUEUED,SENT,FAILED}` already exist (`prisma/schema.prisma`).
- **Email is the channel of record** (ADR-005): always attempt email; LINE is best-effort push for `priority` events when `user.lineUserId` is set.
- New env var ⇒ `src/lib/env.ts` AND `.env.example` in the same task (rule 4); prefixes `RESEND_` / `LINE_`.
- Mock pattern: `vi.mock("@/lib/db", …)` + `vi.mock` the driver/template modules — mirror `src/lib/booking/sweeps.test.ts`.

---

### Task 1: Env vars (`RESEND_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`)

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `env.RESEND_API_KEY: string | undefined`, `env.LINE_CHANNEL_ACCESS_TOKEN: string | undefined`.

- [ ] **Step 1: Add to the zod schema** — insert after the Phase-3 payments (`OPN_*`) block in `src/lib/env.ts`:

```typescript
  // --- Notifications: Resend email + LINE push (ADR-005) ---
  /** Resend API key for transactional email. Optional — console driver in dev/test. */
  RESEND_API_KEY: z.string().optional(),
  /** LINE Messaging API channel access token for push. Optional — console/skip without it. */
  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),
```

- [ ] **Step 2: Add to `.env.example`** — after the Phase-3 payments block:

```bash
# --- Notifications: Resend email + LINE push (ADR-005); optional — console driver until set ---
# RESEND_API_KEY="re_..."                 # Resend dashboard → API keys (email = channel of record)
# LINE_CHANNEL_ACCESS_TOKEN="..."         # LINE OA Messaging API channel access token (push)
```

- [ ] **Step 3: Verify the suite still boots** (optional vars — no `vitest.setup.ts` change needed)

Run: `pnpm test src/lib/money.test.ts`
Expected: PASS (env still validates at boot).

- [ ] **Step 4: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "feat(notifications): RESEND_API_KEY + LINE_CHANNEL_ACCESS_TOKEN env (#63)"
```

---

### Task 2: Drivers (`drivers.ts`)

**Files:**
- Create: `src/lib/notifications/drivers.ts`
- Test: `src/lib/notifications/drivers.test.ts`

**Interfaces:**
- Consumes: `env.NODE_ENV`, `env.RESEND_API_KEY`, `env.LINE_CHANNEL_ACCESS_TOKEN`; global `fetch`.
- Produces: `EmailDriver`/`LineDriver` interfaces; `consoleEmailDriver`, `consoleLineDriver`, `resendEmailDriver`, `lineMessagingDriver`; `selectEmailDriver(nodeEnv, apiKey): EmailDriver`, `selectLineDriver(nodeEnv, token): LineDriver | null`; `getEmailDriver(): EmailDriver`, `getLineDriver(): LineDriver | null`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/notifications/drivers.test.ts
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  consoleEmailDriver,
  lineMessagingDriver,
  resendEmailDriver,
  selectEmailDriver,
  selectLineDriver,
} from "./drivers";

type Init = { method: string; headers: Record<string, string>; body: string };
function stubFetch(status: number) {
  const m = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, text: async () => "" });
  vi.stubGlobal("fetch", m);
  return m;
}
afterEach(() => vi.unstubAllGlobals());

describe("selectEmailDriver", () => {
  it("uses Resend when a key is present", () => {
    expect(selectEmailDriver("production", "re_x")).toBe(resendEmailDriver);
  });
  it("falls back to console in dev/test without a key", () => {
    expect(selectEmailDriver("test", undefined)).toBe(consoleEmailDriver);
  });
  it("throws in production without a key (email = channel of record)", () => {
    expect(() => selectEmailDriver("production", undefined)).toThrow(/channel of record|RESEND/i);
  });
});

describe("selectLineDriver", () => {
  it("uses the LINE driver when a token is present", () => {
    expect(selectLineDriver("production", "tok")).toBe(lineMessagingDriver);
  });
  it("skips (null) in production without a token", () => {
    expect(selectLineDriver("production", undefined)).toBeNull();
  });
  it("falls back to console in dev/test", () => {
    expect(selectLineDriver("development", undefined)).not.toBeNull();
  });
});

describe("resendEmailDriver", () => {
  it("POSTs to Resend with bearer auth and throws on non-2xx", async () => {
    const m = stubFetch(200);
    await resendEmailDriver.send("g@x.com", "subj", "<p>hi</p>");
    const [url, init] = m.mock.calls[0] as unknown as [string, Init];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toMatch(/^Bearer /);
    expect(init.body).toContain("g@x.com");

    stubFetch(500);
    await expect(resendEmailDriver.send("g@x.com", "s", "b")).rejects.toThrow(/Resend 500/);
  });
});

describe("lineMessagingDriver", () => {
  it("POSTs a text push to the LINE Messaging API", async () => {
    const m = stubFetch(200);
    await lineMessagingDriver.push("U123", "hello");
    const [url, init] = m.mock.calls[0] as unknown as [string, Init];
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect(init.body).toContain("U123");
    expect(init.body).toContain("hello");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/notifications/drivers.test.ts`
Expected: FAIL — `Failed to load url ./drivers`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/notifications/drivers.ts
/**
 * Notification delivery drivers (ADR-005). Console drivers print in dev/test;
 * Resend (email) + LINE Messaging (push) drivers hit real APIs in prod. Selection
 * mirrors the OTP `selectSmsDriver` pattern: pure functions of (nodeEnv, key).
 */
import { env } from "@/lib/env";

export interface EmailDriver {
  send(to: string, subject: string, body: string): Promise<void>;
}
export interface LineDriver {
  push(lineUserId: string, text: string): Promise<void>;
}

const EMAIL_FROM = "U-Rest <noreply@urest.app>"; // sender domain verified in Resend before launch

export const consoleEmailDriver: EmailDriver = {
  async send(to, subject, body) {
    console.info(`[email:console] → ${to} | ${subject}\n${body}`);
  },
};
export const consoleLineDriver: LineDriver = {
  async push(lineUserId, text) {
    console.info(`[line:console] → ${lineUserId}: ${text}`);
  },
};

export const resendEmailDriver: EmailDriver = {
  async send(to, subject, body) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html: body }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  },
};
export const lineMessagingDriver: LineDriver = {
  async push(lineUserId, text) {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text }] }),
    });
    if (!res.ok) throw new Error(`LINE ${res.status}: ${await res.text()}`);
  },
};

/** Email = channel of record: Resend if keyed, else console (dev/test), else throw (prod). */
export function selectEmailDriver(nodeEnv: string, apiKey: string | undefined): EmailDriver {
  if (apiKey) return resendEmailDriver;
  if (nodeEnv === "production") {
    throw new Error("No RESEND_API_KEY in production — email is the channel of record (ADR-005).");
  }
  return consoleEmailDriver;
}
export function getEmailDriver(): EmailDriver {
  return selectEmailDriver(env.NODE_ENV, env.RESEND_API_KEY);
}

/** LINE = best-effort push: real if keyed, else console (dev/test), else null (skip in prod). */
export function selectLineDriver(nodeEnv: string, token: string | undefined): LineDriver | null {
  if (token) return lineMessagingDriver;
  if (nodeEnv === "production") return null;
  return consoleLineDriver;
}
export function getLineDriver(): LineDriver | null {
  return selectLineDriver(env.NODE_ENV, env.LINE_CHANNEL_ACCESS_TOKEN);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/notifications/drivers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/drivers.ts src/lib/notifications/drivers.test.ts
git commit -m "feat(notifications): email/LINE drivers + env-based selection (#63)"
```

---

### Task 3: Templates (`templates.ts`)

**Files:**
- Create: `src/lib/notifications/templates.ts`
- Test: `src/lib/notifications/templates.test.ts`

**Interfaces:**
- Produces: `NotificationTemplate` interface `{ priority: boolean; email(payload): {subject, body}; line(payload): string }`; `getTemplate(key: string): NotificationTemplate | undefined`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/notifications/templates.test.ts
import { describe, expect, it } from "vitest";

import { getTemplate } from "./templates";

describe("getTemplate", () => {
  it("renders the BOOKING_REQUESTED email + LINE text (priority) from a payload", () => {
    const t = getTemplate("BOOKING_REQUESTED");
    expect(t).toBeDefined();
    expect(t?.priority).toBe(true);
    const payload = { listingTitle: "บ้านพูลวิลล่า จอมเทียน", guestName: "สมชาย" };
    expect(t?.email(payload).subject).toContain("บ้านพูลวิลล่า จอมเทียน");
    expect(t?.email(payload).body).toContain("สมชาย");
    expect(t?.line(payload)).toContain("บ้านพูลวิลล่า จอมเทียน");
  });

  it("returns undefined for an unknown key", () => {
    expect(getTemplate("NOPE")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/notifications/templates.test.ts`
Expected: FAIL — `Failed to load url ./templates`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/notifications/templates.ts
/**
 * Notification templates (Thai-first). `priority` marks the ADR-005 LINE-push
 * list. Bodies are in-code (not messages/*.json — those are UI strings).
 * Features add their own keys as they land (#21/#25/#26).
 */
export interface NotificationTemplate {
  priority: boolean;
  email(payload: Record<string, unknown>): { subject: string; body: string };
  line(payload: Record<string, unknown>): string;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

const templates: Record<string, NotificationTemplate> = {
  BOOKING_REQUESTED: {
    priority: true,
    email: (p) => ({
      subject: `มีคำขอจองใหม่ — ${str(p.listingTitle)}`,
      body: `คุณมีคำขอจองใหม่จาก ${str(p.guestName)} สำหรับ ${str(p.listingTitle)} กรุณาตอบกลับภายใน 12 ชั่วโมง`,
    }),
    line: (p) => `🔔 คำขอจองใหม่: ${str(p.listingTitle)} จาก ${str(p.guestName)} — ตอบกลับภายใน 12 ชม.`,
  },
};

export function getTemplate(key: string): NotificationTemplate | undefined {
  return templates[key];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/notifications/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/templates.ts src/lib/notifications/templates.test.ts
git commit -m "feat(notifications): template registry + BOOKING_REQUESTED sample (#63)"
```

---

### Task 4: `notify()` fan-out (`index.ts`)

**Files:**
- Create: `src/lib/notifications/index.ts`
- Test: `src/lib/notifications/index.test.ts`

**Interfaces:**
- Consumes: `prisma.user.findUnique`, `prisma.notificationLog.create/update` (`@/lib/db`); `getEmailDriver`/`getLineDriver` (`./drivers`); `getTemplate` (`./templates`).
- Produces: `resolveSend(channel, user, template, payload): (() => Promise<void>) | null`; `notify(userId, templateKey, payload): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/notifications/index.test.ts
import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    notificationLog: { create: vi.fn(), update: vi.fn() },
  },
}));
const emailSend = vi.fn();
const linePush = vi.fn();
vi.mock("./drivers", () => ({
  getEmailDriver: () => ({ send: emailSend }),
  getLineDriver: () => ({ push: linePush }),
}));
vi.mock("./templates", () => ({
  getTemplate: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { notify } from "./index";
import { getTemplate } from "./templates";

const findUser = prisma.user.findUnique as unknown as Mock;
const logCreate = prisma.notificationLog.create as unknown as Mock;
const logUpdate = prisma.notificationLog.update as unknown as Mock;
const template = getTemplate as unknown as Mock;

const PRIORITY_TPL = {
  priority: true,
  email: () => ({ subject: "s", body: "b" }),
  line: () => "t",
};

beforeEach(() => {
  template.mockReturnValue(PRIORITY_TPL);
  logCreate.mockImplementation(async ({ data }: { data: { channel: NotificationChannel } }) => ({ id: `log-${data.channel}` }));
  logUpdate.mockResolvedValue({});
  emailSend.mockResolvedValue(undefined);
  linePush.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("notify", () => {
  it("always emails, and pushes LINE for a priority template when lineUserId is linked", async () => {
    findUser.mockResolvedValue({ email: "g@x.com", lineUserId: "U1" });

    await notify("u1", "BOOKING_REQUESTED", { a: 1 });

    expect(emailSend).toHaveBeenCalledWith("g@x.com", "s", "b");
    expect(linePush).toHaveBeenCalledWith("U1", "t");
    // one QUEUED row per channel, each marked SENT
    expect(logCreate).toHaveBeenCalledTimes(2);
    expect(logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: NotificationStatus.SENT }) }),
    );
  });

  it("emails only when the user has no linked LINE", async () => {
    findUser.mockResolvedValue({ email: "g@x.com", lineUserId: null });
    await notify("u1", "BOOKING_REQUESTED", {});
    expect(emailSend).toHaveBeenCalledOnce();
    expect(linePush).not.toHaveBeenCalled();
  });

  it("skips LINE for a non-priority template", async () => {
    template.mockReturnValue({ ...PRIORITY_TPL, priority: false });
    findUser.mockResolvedValue({ email: "g@x.com", lineUserId: "U1" });
    await notify("u1", "SOMETHING", {});
    expect(emailSend).toHaveBeenCalledOnce();
    expect(linePush).not.toHaveBeenCalled();
  });

  it("never throws when a driver fails — marks the row FAILED", async () => {
    findUser.mockResolvedValue({ email: "g@x.com", lineUserId: null });
    emailSend.mockRejectedValue(new Error("smtp down"));

    await expect(notify("u1", "BOOKING_REQUESTED", {})).resolves.toBeUndefined();

    expect(logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: NotificationStatus.FAILED, lastError: "smtp down" }),
      }),
    );
  });

  it("is a safe no-op for an unknown template", async () => {
    template.mockReturnValue(undefined);
    await notify("u1", "NOPE", {});
    expect(findUser).not.toHaveBeenCalled();
    expect(logCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/notifications/index.test.ts`
Expected: FAIL — `Failed to load url ./index`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/notifications/index.ts
/**
 * Notification fan-out (ADR-005). `notify` emails always (channel of record) and
 * pushes LINE for `priority` templates when the user has a linked `lineUserId`.
 * Each channel is one NotificationLog row (QUEUED→SENT/FAILED). NEVER throws —
 * dispatch failures become FAILED rows for the retry sweep, so callers just await.
 */
import { NotificationChannel, NotificationStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { getEmailDriver, getLineDriver } from "./drivers";
import { getTemplate, type NotificationTemplate } from "./templates";

interface Recipient {
  email: string | null;
  lineUserId: string | null;
}

/** Build the driver call for a channel, or null if it can't/shouldn't send. Shared with the retry sweep. */
export function resolveSend(
  channel: NotificationChannel,
  user: Recipient,
  template: NotificationTemplate,
  payload: Record<string, unknown>,
): (() => Promise<void>) | null {
  if (channel === NotificationChannel.EMAIL && user.email) {
    const to = user.email;
    const { subject, body } = template.email(payload);
    const driver = getEmailDriver();
    return () => driver.send(to, subject, body);
  }
  if (channel === NotificationChannel.LINE && template.priority && user.lineUserId) {
    const driver = getLineDriver();
    if (!driver) return null;
    const to = user.lineUserId;
    const text = template.line(payload);
    return () => driver.push(to, text);
  }
  return null;
}

async function dispatch(
  channel: NotificationChannel,
  userId: string,
  templateKey: string,
  payload: Record<string, unknown>,
  send: () => Promise<void>,
): Promise<void> {
  const log = await prisma.notificationLog.create({
    data: {
      userId,
      channel,
      templateKey,
      payload: payload as Prisma.InputJsonValue,
      status: NotificationStatus.QUEUED,
    },
  });
  try {
    await send();
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: NotificationStatus.SENT, sentAt: new Date(), attempts: 1 },
    });
  } catch (err) {
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: NotificationStatus.FAILED,
        attempts: 1,
        lastError: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

export async function notify(
  userId: string,
  templateKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const template = getTemplate(templateKey);
  if (!template) {
    console.error(`[notify] unknown template: ${templateKey}`);
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, lineUserId: true },
  });
  if (!user) {
    console.error(`[notify] unknown user: ${userId}`);
    return;
  }

  for (const channel of [NotificationChannel.EMAIL, NotificationChannel.LINE]) {
    const send = resolveSend(channel, user, template, payload);
    if (send) await dispatch(channel, userId, templateKey, payload, send);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/notifications/index.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/index.ts src/lib/notifications/index.test.ts
git commit -m "feat(notifications): notify() email-always + priority-LINE fan-out (#63)"
```

---

### Task 5: Retry sweep (`retry.ts`) + wire into cron

**Files:**
- Create: `src/lib/notifications/retry.ts`
- Test: `src/lib/notifications/retry.test.ts`
- Modify: `src/lib/jobs/scheduler.ts` (add the sweep to `runSweeps`)
- Modify: `src/lib/jobs/scheduler.test.ts` (assert it's called)

**Interfaces:**
- Consumes: `prisma.notificationLog.findMany/update`, `prisma.user.findUnique`; `resolveSend` (`./index`); `getTemplate` (`./templates`).
- Produces: `sweepFailedNotifications(): Promise<number>`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/notifications/retry.test.ts
import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const emailSend = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    notificationLog: { findMany: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("./drivers", () => ({ getEmailDriver: () => ({ send: emailSend }), getLineDriver: () => null }));
vi.mock("./templates", () => ({
  getTemplate: () => ({ priority: true, email: () => ({ subject: "s", body: "b" }), line: () => "t" }),
}));

import { prisma } from "@/lib/db";
import { sweepFailedNotifications } from "./retry";

const findMany = prisma.notificationLog.findMany as unknown as Mock;
const update = prisma.notificationLog.update as unknown as Mock;
const findUser = prisma.user.findUnique as unknown as Mock;

beforeEach(() => {
  update.mockResolvedValue({});
  findUser.mockResolvedValue({ email: "g@x.com", lineUserId: null });
  emailSend.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("sweepFailedNotifications", () => {
  it("queries FAILED rows under the attempt cap and re-sends them", async () => {
    findMany.mockResolvedValue([
      { id: "l1", userId: "u1", channel: NotificationChannel.EMAIL, templateKey: "BOOKING_REQUESTED", payload: {}, attempts: 1 },
    ]);

    const n = await sweepFailedNotifications();

    expect(findMany).toHaveBeenCalledWith({
      where: { status: NotificationStatus.FAILED, attempts: { lt: 5 } },
    });
    expect(emailSend).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "l1" }, data: expect.objectContaining({ status: NotificationStatus.SENT, attempts: 2 }) }),
    );
    expect(n).toBe(1);
  });

  it("keeps the row FAILED (attempts+1) when the re-send fails again", async () => {
    findMany.mockResolvedValue([
      { id: "l1", userId: "u1", channel: NotificationChannel.EMAIL, templateKey: "BOOKING_REQUESTED", payload: {}, attempts: 2 },
    ]);
    emailSend.mockRejectedValue(new Error("still down"));

    const n = await sweepFailedNotifications();

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "l1" }, data: expect.objectContaining({ attempts: 3, lastError: "still down" }) }),
    );
    expect(n).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/notifications/retry.test.ts`
Expected: FAIL — `Failed to load url ./retry`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/notifications/retry.ts
/**
 * Retry sweep for FAILED notifications (ADR-004/005). Re-renders + re-dispatches
 * each FAILED row under the attempt cap; wired into the cron scheduler. Count-
 * capped (no exponential backoff — YAGNI for pilot).
 */
import { NotificationStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

import { resolveSend } from "./index";
import { getTemplate } from "./templates";

const MAX_ATTEMPTS = 5;

export async function sweepFailedNotifications(): Promise<number> {
  const rows = await prisma.notificationLog.findMany({
    where: { status: NotificationStatus.FAILED, attempts: { lt: MAX_ATTEMPTS } },
  });
  let resent = 0;
  for (const row of rows) {
    const template = getTemplate(row.templateKey);
    if (!template || !row.userId) continue;
    const user = await prisma.user.findUnique({
      where: { id: row.userId },
      select: { email: true, lineUserId: true },
    });
    if (!user) continue;
    const payload = (typeof row.payload === "object" && row.payload !== null ? row.payload : {}) as Record<string, unknown>;
    const send = resolveSend(row.channel, user, template, payload);
    if (!send) continue;
    try {
      await send();
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date(), attempts: row.attempts + 1 },
      });
      resent++;
    } catch (err) {
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: { attempts: row.attempts + 1, lastError: err instanceof Error ? err.message : String(err) },
      });
    }
  }
  return resent;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/notifications/retry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into the cron scheduler** — edit `src/lib/jobs/scheduler.ts`:

Add the import:
```typescript
import { sweepFailedNotifications } from "@/lib/notifications/retry";
```
Add one entry to the `jobs` array in `runSweeps` (after `purge-otps`):
```typescript
    ["retry-notifications", () => sweepFailedNotifications()],
```

- [ ] **Step 6: Update the scheduler test** — edit `src/lib/jobs/scheduler.test.ts`:

Add the mock (next to the others):
```typescript
vi.mock("@/lib/notifications/retry", () => ({ sweepFailedNotifications: vi.fn().mockResolvedValue(0) }));
```
Add an import + assertion in the `runSweeps` "runs every sweep" test:
```typescript
import { sweepFailedNotifications } from "@/lib/notifications/retry";
// ...inside the test:
expect(sweepFailedNotifications as unknown as Mock).toHaveBeenCalledOnce();
```

- [ ] **Step 7: Run the suite + gate**

Run: `pnpm test src/lib/notifications src/lib/jobs && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/notifications/retry.ts src/lib/notifications/retry.test.ts src/lib/jobs/scheduler.ts src/lib/jobs/scheduler.test.ts
git commit -m "feat(notifications): retry sweep wired into cron (#63)"
```

---

## Self-review
- **Spec coverage:** drivers + selection (Task 2) ✓; `notify()` fan-out email-always + priority-LINE + never-throws + NotificationLog per channel (Task 4) ✓; templates registry + sample (Task 3) ✓; retry sweep + cron wiring (Task 5) ✓; env optional vars (Task 1) ✓; "triggers wired per-feature" = out of scope, none here ✓; testing matrix ✓.
- **Placeholders:** none — every step has complete code/commands.
- **Type consistency:** `EmailDriver.send(to,subject,body)`, `LineDriver.push(lineUserId,text)`, `selectEmailDriver(nodeEnv,apiKey)`, `selectLineDriver(nodeEnv,token)→|null`, `getTemplate(key)→|undefined`, `NotificationTemplate{priority,email,line}`, `resolveSend(channel,user,template,payload)→thunk|null`, `notify(userId,templateKey,payload)`, `sweepFailedNotifications()→number` — consistent across tasks. `resolveSend` is defined in Task 4 (`index.ts`) and consumed in Task 5 (`retry.ts`).

## Verification (end-to-end)
1. `pnpm typecheck && pnpm lint && pnpm test` — green (~16 new tests).
2. `pnpm gate:status` — green (no Booking.status writes).
3. `pnpm dev` — `[cron] scheduler started`; the retry sweep is part of `runSweeps` now.
4. Open PR `feat/63-notifications` → main, `Closes #63`, `area:infra` + `M3`. Aok squash-merges.
