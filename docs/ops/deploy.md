# Deploy runbook — Railway (issue #9)

How U-Rest is deployed and operated on Railway. Decisions are locked in **ADR-002** (hosting)
and **ADR-010** (the production `DATA_ENCRYPTION_KEY`). This is the human checklist for the
`hitl` parts; the repo already carries the build/start/healthcheck/migration config.

> **Region:** Singapore (~30–50ms from Thailand, ADR-002 §1). **Budget:** ~฿1,000/mo all-in;
> Railway estimate $5–10/mo. **Builder:** Nixpacks via `railway.json`.

## What the repo already provides

| Concern | Where |
|---|---|
| Standalone output | `next.config.ts` → `output: "standalone"` + `scripts/prepare-standalone.mjs` (postbuild) |
| Start command | `pnpm start` → `node .next/standalone/server.js` (ADR-002 §5) |
| Build / start / healthcheck / restart | `railway.json` |
| Run migrations before traffic | `railway.json` `preDeployCommand: pnpm db:deploy` (= `prisma migrate deploy`) |
| Fail boot on bad config | `src/instrumentation.ts` imports `@/lib/env` (zod, throws) at server start |
| Healthcheck endpoint | `GET /api/health` → `{ "status": "ok" }` (liveness only, no DB) |

So a `git push` to `main` → Railway builds with Nixpacks → runs `pnpm db:deploy` → starts the
standalone server → waits for `/api/health` to pass → routes traffic.

## One-time setup (you, in the Railway dashboard)

> Prerequisite: the identity schema (#4) is merged to `main` so `prisma migrate deploy` has
> migrations to apply.

1. **Create the project + Postgres.** New Railway project, **Singapore** region. Add the
   **PostgreSQL** plugin. Enable pgvector once (ADR-006): in the DB shell run
   `CREATE EXTENSION IF NOT EXISTS vector;` (or include it in the first migration).
2. **Create the app service from GitHub.** Connect the `Web-URest/URest` repo, branch `main`.
   Railway auto-detects `railway.json`. Deploy-on-push to `main` is on by default (ADR-002 §4).
3. **Set environment variables** on the app service (Variables tab):

   | Var | Value | Notes |
   |---|---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway reference variable — links the DB plugin |
   | `DATA_ENCRYPTION_KEY` | *(generated, see below)* | 32 bytes base64; **never commit**; back up in the password manager (ADR-010) |
   | `NODE_ENV` | `production` | |
   | `HOSTNAME` | `0.0.0.0` | **Required** — the Next standalone server otherwise binds localhost and Railway can't reach it |

   `PORT` is injected by Railway; the standalone server reads it automatically — do not set it.
   These four are all `env.ts` currently requires; add `AUTH_SECRET`, `ADMIN_SESSION_SECRET`,
   `LINE_*`, `OPN_*`, `ANTHROPIC_API_KEY`, … as each phase un-comments them in `env.ts` (rule 4).

4. **Generate + back up `DATA_ENCRYPTION_KEY`** (ADR-010 — key loss = data loss):
   ```bash
   node -e "console.log(crypto.randomBytes(32).toString('base64'))"
   ```
   Paste into Railway, then store the **same value** in the team password manager labelled
   `U-Rest prod DATA_ENCRYPTION_KEY`. It is **not** in git, logs, or Railway build args (runtime
   env only). Generate a *different* key per environment — never reuse dev's.

5. **Spend alert (~$15).** Railway → Usage / Billing → set a usage alert at **USD 15/month**
   (ADR-002 §31).

## Backups (ADR-002 §29 — guest/booking/ledger loss is existential)

Two layers:

1. **Railway managed backups** — enable on the Postgres service (daily).
2. **Weekly `pg_dump` to Cloudflare R2** — independent copy off Railway:
   ```bash
   pg_dump "$DATABASE_URL" --format=custom --no-owner --file="urest-$(date +%F).dump"
   # upload urest-<date>.dump to the private R2 bucket (rclone / aws s3 cp --endpoint-url …)
   ```
   For the pilot this can be a manual weekly task or a scheduled job once the ADR-004 scheduler
   lands; keep at least the last 4 weekly dumps.

### Restore test (do once, record below)

```bash
# Into a SCRATCH database — never the live one:
createdb urest_restore_test
pg_restore --no-owner --dbname="postgresql://…/urest_restore_test" urest-<date>.dump
# sanity-check row counts on a couple of tables, then drop the scratch DB.
```

| Date tested | Dump used | By | Result |
|---|---|---|---|
| _(fill in)_ | | | |

## Verify (maps to issue #9 acceptance criteria)

- [ ] **App live + deploys on merge** — push to `main`, watch the Railway deploy, hit the
      service URL and `GET /api/health` → `{"status":"ok"}`.
- [ ] **Missing env var fails boot loudly** — temporarily unset `DATA_ENCRYPTION_KEY` in Railway,
      redeploy: boot must crash with the `env.ts` error (the deploy fails, old version stays up).
      Restore the var.
- [ ] **Backup restore tested once + documented** — run the restore test above, fill the table.
- [ ] **Spend alert configured (~$15)** — confirmed in Railway billing.

## Operations

- **Rollback:** Railway → Deployments → redeploy the previous good build. Migrations are
  forward-only (`migrate deploy`); a bad migration needs a new corrective migration, not a
  rollback of the DB.
- **Migrations** run automatically pre-deploy (`railway.json`). They apply only committed
  migrations and are safe to re-run.
- **Logs:** keep Prisma query logging **off** in production and never log PII / `*Enc` values /
  secrets (ADR-010 §7). Access/traffic logs retained ≥90 days (Computer Crime Act, ADR-010 §6).
