# Design — notifications dispatch layer (Resend email + LINE push) · issue #63

**Status:** approved (2026-06-17) · **Branch:** `feat/63-notifications` · **Phase:** 3
**Authority:** binding contracts remain `ADR-005` (email-always + priority-LINE), `PRODUCT_FLOWS.md`
§6 (matrix), CLAUDE.md rules. Decomposed from #21; second of the three slices (cron #61 ✅ merged).

## Problem
The booking/payout/dispute/review flows all need to notify guests and hosts, but there's no dispatch
layer — only the `NotificationLog` table + the §6 matrix on paper. ADR-005 sets the policy: **email
(Resend) mirrors every notification** as the channel of record; **LINE push is reserved for a
priority list** of time-critical events; users without a linked `lineUserId` get email-only. This
slice builds the infrastructure (drivers, fan-out, retry) + one sample event; each feature wires its
own events later.

## Decision / approach
Mirror the OTP SMS pattern (`SmsDriver` + `consoleSmsDriver` + `selectSmsDriver`): per-channel driver
interfaces with a console driver for dev/test and a real driver for prod, chosen by a pure selection
function. `notify()` applies the ADR-005 fan-out and records every send in `NotificationLog`; failures
are retried by a cron sweep (slice-1 scheduler).

## Architecture — `src/lib/notifications/`

**`drivers.ts`**
- `interface EmailDriver { send(to: string, subject: string, body: string): Promise<void> }`
- `interface LineDriver { push(lineUserId: string, text: string): Promise<void> }`
- `consoleEmailDriver` / `consoleLineDriver` — log only (dev/test).
- `resendEmailDriver` / `lineMessagingDriver` — real HTTP clients (prod).
- `selectEmailDriver(env)`: `RESEND_API_KEY` set → Resend; else console in dev/test; **throw in prod**
  (email is the channel of record — fail loud rather than silently lose it).
- `selectLineDriver(env)`: `LINE_CHANNEL_ACCESS_TOKEN` set → real; else console in dev/test;
  **skip (no-op) in prod** (LINE is best-effort; degrade to email-only, never throw).

**`templates.ts`** — registry `templateKey → NotificationTemplate`:
`{ priority: boolean; email(payload): { subject: string; body: string }; line(payload): string }`.
`priority` marks the ADR-005 LINE-push list (booking-requested, payment-received, payment-window-
opened, T-1 check-in, dispute opened/resolved, payout-sent, listing-approval). Thai-first; in-code
(notification bodies are not UI strings, so not in `messages/*.json`). Ships one sample:
`BOOKING_REQUESTED` (→ host).

**`index.ts`** — `notify(userId: string, templateKey: string, payload: Record<string, unknown>): Promise<void>`:
1. Load the user (`email`, `lineUserId`); look up the template (unknown key → log + return).
2. **Email (always, if `user.email`):** insert `NotificationLog{channel:EMAIL, templateKey, payload, QUEUED}`
   → `emailDriver.send` → update `SENT` (`sentAt`) or `FAILED` (`lastError`, `attempts:1`).
3. **LINE (only if `template.priority` AND `user.lineUserId`):** same QUEUED→dispatch→status cycle.
4. **Never throws** — each dispatch is wrapped; a failure marks the row `FAILED` for the retry sweep.
   Callers `await notify(...)` without guarding.

**`retry.ts`** — `sweepFailedNotifications(): Promise<number>`: `findMany {status:FAILED, attempts < MAX_ATTEMPTS}`
(`MAX_ATTEMPTS = 5`) → re-dispatch via the matching driver → increment `attempts`, mark `SENT` or
keep `FAILED`+`lastError`. Count-capped (no exponential backoff — YAGNI for pilot). Wired into
slice-1's `runSweeps` (`src/lib/jobs/scheduler.ts` gains one entry: `["retry-notifications", () => sweepFailedNotifications()]`).

## Data flow
`feature action / cron sweep` → `await notify(userId, key, payload)` → 1–2 `NotificationLog` rows →
driver dispatch → status. Failed rows → cron retry sweep → eventual `SENT` or capped-out `FAILED`.

## Env / config
`src/lib/env.ts` + `.env.example` (lockstep): `RESEND_API_KEY` + `LINE_CHANNEL_ACCESS_TOKEN`, both
`.optional()` — boot/dev/test don't require them (console fallback); real creds are a later hitl step.
`vitest.setup.ts` needs no entry (optional vars).

## Triggers (documented, not wired here)
Features call `await notify(...)` from a server action after a transition, or from a cron sweep
(e.g., the `expire` sweep notifies the affected party). This slice ships **no triggers** — #21/#25/#26
add their own events + templates as they land.

## Error handling
`notify` never throws (dispatch failures → `FAILED` rows + the retry sweep). The email driver throwing
in prod-without-Resend surfaces at send time (logged as `FAILED`), consistent with ADR-005 "no
notification is ever lost." Per-channel isolation: an email failure doesn't block the LINE send.

## Testing (Vitest; mock prisma + drivers)
- `selectEmailDriver`/`selectLineDriver`: console in dev/test, real when key set, email throws in prod
  w/o Resend, LINE skips in prod w/o token.
- `notify`: email always (when `email` present); LINE only when `priority && lineUserId`; marks
  `SENT`/`FAILED`; **never throws** when a driver rejects; unknown templateKey is a safe no-op.
- `templates`: the sample renders email `{subject, body}` + LINE text from a payload.
- `sweepFailedNotifications`: re-dispatches FAILED rows under the cap; increments attempts; stops at MAX.
- `scheduler.runSweeps` now includes `retry-notifications`.

## Out of scope
The other ~18 §6 event templates + their triggers (per-feature), LINE quota-priority dropping
(ADR-005 rule 4 — config array, add when quota is real), exponential backoff, the "connect LINE" UI nudge.
