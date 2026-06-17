#!/usr/bin/env node
/**
 * Grep gate for CLAUDE.md rule 2 / ADR-003 (issue #19): `Booking.status` and
 * `Booking.escrowState` may be written ONLY inside `src/lib/booking` and
 * `src/lib/ledger`. Pages, components, API routes, and the cron sweeper must go
 * through those modules' transition functions.
 *
 * This is a heuristic backstop, not an AST analysis — the real guarantee is the
 * module architecture + review. It flags `prisma|tx|db.booking.<mutation>(…)`
 * calls whose `data: { … }` carries `status:` or `escrowState:` anywhere outside
 * the two owning directories. Run via `pnpm gate:status`; CI runs it after lint.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const ALLOWED = [join("src", "lib", "booking"), join("src", "lib", "ledger")];

const MUTATION = /\b(?:prisma|tx|db)\.booking\.(?:update|updateMany|upsert|create|createMany)\s*\(/g;
const DATA_FIELD = /\bdata\s*:\s*\{[\s\S]*?\b(status|escrowState)\s*:/;

/** Blank out comments while preserving line numbers (block comments → spaces). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "");
}

function isAllowed(rel) {
  return ALLOWED.some((a) => rel === a || rel.startsWith(a + sep));
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) yield full;
  }
}

const violations = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (isAllowed(rel)) continue;

  const code = stripComments(readFileSync(file, "utf8"));
  for (const m of code.matchAll(MUTATION)) {
    const found = code.slice(m.index, m.index + 500).match(DATA_FIELD);
    if (found) {
      const line = code.slice(0, m.index).split("\n").length;
      violations.push(`${rel}:${line} — writes Booking.${found[1]} directly`);
    }
  }
}

if (violations.length > 0) {
  console.error("✖ Direct Booking state writes found outside lib/booking + lib/ledger:\n");
  for (const v of violations) console.error("  " + v);
  console.error(
    "\nBooking.status and Booking.escrowState transition ONLY through their lib\n" +
      "modules (CLAUDE.md rule 2, ADR-003). Call the transition function instead.",
  );
  process.exit(1);
}

console.log("✓ No direct Booking.status / escrowState writes outside lib/booking + lib/ledger.");
