/**
 * Liveness probe for Railway's healthcheck (railway.json → `/api/health`).
 *
 * Deliberately does NOT touch the database — it answers "is the process up and
 * serving?", not "is every dependency healthy". A transient DB blip must not
 * make Railway mark a healthy instance unhealthy and loop the deploy. If a
 * readiness/DB check is ever needed, add it on a separate path.
 *
 * Outside the `[locale]` segment, and the i18n middleware matcher already
 * excludes `/api`, so this stays locale-agnostic and unredirected.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
