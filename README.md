# U-Rest

**จองพูลวิลล่าโดยไม่ต้องเสี่ยงโดนโกง** — escrow-protected pool-villa booking for Thai group travelers. Every villa is identity-verified; guests pay 100% in-app; hosts are paid only 24h after check-in.

## Stack

Next.js (App Router, TS strict) monolith · PostgreSQL + pgvector via Prisma · Tailwind v4 · next-intl (Thai-first) · Opn Payments · LINE Login · Claude (น้องเรสต์ concierge) · Railway + Cloudflare R2. Full rationale: [`docs/adr/`](docs/adr/).

## Getting started

Prereqs: **Node ≥22**, **pnpm** (`corepack enable`, or `npm i -g pnpm@10`), **Docker Desktop**, and on Windows: **Developer Mode enabled** (Settings → System → For developers) — required for local `pnpm build` (the standalone output creates symlinks); `pnpm dev` works without it.

```bash
pnpm install          # also runs prisma generate
cp .env.example .env  # defaults work for local dev
pnpm db:up            # Postgres + pgvector in Docker
pnpm db:migrate       # apply schema
pnpm dev              # http://localhost:3000
```

PR gate (CI runs the same): `pnpm typecheck && pnpm lint && pnpm test`

## Documentation map

| File | What it is |
|---|---|
| [`PRODUCT_FLOWS.md`](PRODUCT_FLOWS.md) | The functional contract — roles, state machines, flows, notifications |
| [`PRD.md`](PRD.md) | Scope, success metrics, launch gate |
| [`BUSINESS_PLAN.md`](BUSINESS_PLAN.md) | Market, unit economics, legal roadmap, GTM |
| [`docs/adr/`](docs/adr/) | 10 architecture decision records |
| [`docs/AI_CONCIERGE_SPEC.md`](docs/AI_CONCIERGE_SPEC.md) | น้องเรสต์ implementation contract |
| [`DESIGN_SPEC.md`](DESIGN_SPEC.md) + [`design/standalone/`](design/standalone/) | Design tokens + the interactive design prototype (all pages/roles) |
| [`CLAUDE.md`](CLAUDE.md) | Engineering conventions (enforced in review) |

## Build phases

0. ✅ Design prototype & specs → 1. **Foundation** (current) → 2. Listings → 3. Booking & escrow → 4. AI concierge → 5. Trust & polish
