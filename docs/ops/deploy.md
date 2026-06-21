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
   | `AUTH_SECRET` | `openssl rand -base64 32` | Auth.js signing secret (ADR-007) |
   | `AUTH_URL` | the public app URL, e.g. `https://urest.up.railway.app` | **Required in prod** — Auth.js builds OAuth callbacks from it; without it the callback uses the `0.0.0.0:8080` bind host and Google rejects `redirect_uri`. Must match the URI registered in Google Cloud |
   | `ADMIN_SESSION_SECRET` | `openssl rand -base64 32` | Admin session HMAC; **separate** from `AUTH_SECRET` (ADR-010 #4) |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | *(prod Google OAuth 2.0 client)* | a client SEPARATE from dev; register redirect URI `https://<domain>/api/auth/callback/google` + JS origin (ADR-007; LINE disabled) |
   | `NODE_ENV` | `production` | |
   | `HOSTNAME` | `0.0.0.0` | **Required** — the Next standalone server otherwise binds localhost and Railway can't reach it |
   | `R2_ACCOUNT_ID` | *(Cloudflare account id)* | R2 S3 endpoint host (#11) |
   | `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | *(scoped R2 API token)* | object read/write on the two buckets only |
   | `R2_PUBLIC_BUCKET` / `R2_PRIVATE_BUCKET` | *(bucket names)* | photos vs KYC; **never** attach a CDN to the private one |
   | `R2_PUBLIC_BASE_URL` | *(public CDN domain)* | e.g. `https://media.urest.app`, no trailing slash |
   | `OPN_PUBLIC_KEY` / `OPN_SECRET_KEY` | *(Opn LIVE keys: `pkey_live_…` / `skey_live_…`)* | from the Opn dashboard at the launch gate; test keys (`*_test_*`) until then. `OPN_API_BASE` stays default. The key prefix — not the URL — selects sandbox vs live, so going live is a key swap, no code change (PRD §6) |
   | `RESEND_API_KEY` | *(Resend API key)* | email is the channel of record (ADR-005) — required in prod or `notify` throws on send |
   | `ANTHROPIC_API_KEY` | *(Anthropic console key)* | AI concierge (#32–34); absent → the concierge shows the "น้องเรสต์พักผ่อน" kill-switch banner and the site works without it |

   `PORT` is injected by Railway; the standalone server reads it automatically — do not set it.
   All of the above are **required at boot today**: `env.ts` validates them and `instrumentation.ts`
   exits non-zero if any is missing, so a deploy missing one *fails* rather than going live. Add
   `GOOGLE_*` / `FACEBOOK_*` (ADR-007 multi-provider), `OPN_*` (Phase 3), and `ANTHROPIC_API_KEY`
   (Phase 4) as each is un-commented in `env.ts` (rule 4).

4. **Generate + back up `DATA_ENCRYPTION_KEY`** (ADR-010 — key loss = data loss):
   ```bash
   node -e "console.log(crypto.randomBytes(32).toString('base64'))"
   ```
   Paste into Railway, then store the **same value** in the team password manager labelled
   `U-Rest prod DATA_ENCRYPTION_KEY`. It is **not** in git, logs, or Railway build args (runtime
   env only). Generate a *different* key per environment — never reuse dev's.

5. **Spend alert (~$15).** Railway → Usage / Billing → set a usage alert at **USD 15/month**
   (ADR-002 §31).

6. **Cloudflare R2 buckets (#11).** Create **two** R2 buckets — public (listing photos) and
   private (KYC). Attach a CDN/custom domain to the **public** bucket only → `R2_PUBLIC_BASE_URL`;
   the private bucket gets **no** public access. Mint a **scoped** R2 API token (object read/write
   on these two buckets) → `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`; `R2_ACCOUNT_ID` is the
   Cloudflare account id. Add a CORS rule on the **public** bucket allowing `PUT` from the app
   origin so browser presigned uploads work. Set all six vars in Railway (table above).

   **Manual acceptance (do once, after the vars are live — issue #11):**
   - [ ] Host wizard → add a photo → object lands in the **public** bucket and the tile renders via the CDN URL.
   - [ ] A KYC presign PUT lands in the **private** bucket; the direct (unsigned) object URL returns **403**.
   - [ ] `kycDocumentSignedUrl` GET opens the document; the same URL after its TTL (5 min) **fails**.
   - [ ] `grep` Railway logs / Sentry — no `r2Key` or signed URL appears anywhere.

## Backups (ADR-002 §29 — guest/booking/ledger loss is existential)

Two layers:

1. **Railway managed backups** — enable on the Postgres service (daily).
2. **Weekly `pg_dump` to Cloudflare R2** — independent copy off Railway. From a laptop, use the
   Postgres **public** URL (Railway → Postgres → Variables → `DATABASE_PUBLIC_URL`, host
   `…proxy.rlwy.net` — the internal `…railway.internal` URL only works between Railway services),
   and a `pg_dump` whose major version is **≥ the server** (prod is **PG 18** as of 2026-06; a pg16
   client refuses to dump it). Easiest is a version-matched container that writes the dump to the host:
   ```bash
   docker run --rm pgvector/pgvector:pg18 \
     pg_dump "$DATABASE_PUBLIC_URL" -Fc --no-owner > "urest-$(date +%F).dump"
   # then upload urest-<date>.dump to the private R2 bucket (rclone / aws s3 cp --endpoint-url …)
   ```
   For the pilot this is a manual weekly task or a scheduled job once the ADR-004 scheduler lands;
   keep at least the last 4 weekly dumps. The public URL carries the DB password — keep it out of
   logs / shell history.

### Restore test (do once, record below)

Restore into a **throwaway container** (never the live DB), on a Postgres major version that
**matches prod** (PG 18) so the dump/restore tools are compatible — use the pgvector image so the
`vector` extension restores cleanly. From the repo root (PowerShell shown for `$PROD`/sleep):

```powershell
$PROD = '<DATABASE_PUBLIC_URL from Railway>'   # secret — keep out of shared logs

docker run -d --name pgtest -e POSTGRES_USER=urest -e POSTGRES_PASSWORD=test `
  -e POSTGRES_DB=urest_restore_test pgvector/pgvector:pg18
Start-Sleep -Seconds 6   # let it initialize

docker exec pgtest pg_dump "$PROD" -Fc --no-owner -f /tmp/urest.dump
docker exec pgtest pg_restore -U urest --no-owner -d urest_restore_test /tmp/urest.dump
docker exec pgtest psql -U urest -d urest_restore_test -c '\dt'                      # tables back?
docker exec pgtest psql -U urest -d urest_restore_test -c 'SELECT count(*) FROM "User";'
docker rm -f pgtest   # delete the throwaway container + its data
```

(Bash: `PROD='…'`, `sleep 6`, drop the backticks.) Success = `\dt` lists the tables and the
commands finish without error.

| Date tested | Dump used | By | Result |
|---|---|---|---|
| 2026-06-16 | prod `DATABASE_PUBLIC_URL` (PG 18) | @AokDesu | ✅ 22 tables restored (incl. `_prisma_migrations`); `User` count 0 (fresh prod) |

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
