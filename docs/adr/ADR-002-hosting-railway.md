# ADR-002: Railway (Singapore) for app + database, Cloudflare R2 for media

**Status:** Accepted · 2026-06-12

## Context

Budget is ~฿1,000/month all-in. The stack is locked (Next.js App Router + TS + Prisma + PostgreSQL/pgvector). Two workload traits constrain hosting:

1. **Timers everywhere.** Host-accept 12h, payment windows 12h/1h, PromptPay QR 15-min expiry, payout release at checkout, review window 14d, SLA alarms. These want a reliable scheduler.
2. **Money webhooks.** Opn's charge-succeeded webhook confirms payment inside a 15-minute QR window. A cold-starting or sleeping instance that delays webhook processing can cost a real booking.

Options rejected:
- **Vercel Hobby** — free tier prohibits commercial use; Pro is $20/mo ≈ ฿720 (the whole budget) and serverless still needs external cron for every timer.
- **Render free tier** — instances sleep on idle; see webhook trait above.
- **Bangkok VPS (Vultr $6) + Dokploy** — cheapest latency, but makes a student team the sysadmin of a box holding ID documents and money records. Operational risk > latency gain.

## Decision

1. **Railway, Singapore region** (~30–50ms from Thailand): one project running (a) the Next.js standalone server and (b) Postgres with pgvector. Estimated $5–10/month ≈ ฿180–360.
2. **Booking timers run in-process** (node-cron inside the Next.js custom server / a tiny worker entry in the same deploy). No external cron service, no queue infra in v1 (ADR-004).
3. **Media on Cloudflare R2**: listing photos (public bucket behind Cloudflare CDN) and KYC documents (separate **private** bucket, signed URLs only, PDPA scope). Free tier: 10GB + zero egress fees.
4. Deploy from GitHub push; Railway preview environments optional later.
5. **Tooling: pnpm as package manager; Node LTS as production runtime** (decision 2026-06-12, revised same day — Bun was briefly chosen, then reverted after team research; full tooling rationale in ADR-009). Railway start command: `node .next/standalone/server.js`.

## Consequences

- ✅ Fits budget with headroom for Claude API + domain; one platform to learn; always-on process makes webhooks and timers boring.
- ✅ pgvector available for the AI concierge's attraction search (ADR-006).
- ⚠️ Postgres backups: enable Railway's backups AND a weekly `pg_dump` to R2 — guest/booking/ledger data loss is existential for a trust brand.
- ⚠️ Singapore, not Bangkok: acceptable latency; revisit only if TTFB measurably hurts mobile UX.
- ⚠️ Railway usage pricing can creep — set a spend alert at $15/month.
