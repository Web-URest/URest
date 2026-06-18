#!/usr/bin/env node
/**
 * Grep gate for CLAUDE.md rule 2 (issue #28): `Review` and `GuestRating` may be
 * WRITTEN only inside `src/lib/reviews`, which owns the gating, the soft-removal,
 * and the denormalized `Listing.avgRating`/`reviewCount` recompute. Pages,
 * actions, and the admin queue must call `submitReview`/`removeReview`/`rateGuest`
 * instead of mutating the tables directly.
 *
 * Heuristic backstop, not AST analysis: flags `prisma|tx|db.{review,guestRating}.
 * <mutation>(…)` outside the owning directory. (`Report` is intentionally NOT
 * covered — it's shared with the reports/disputes system, #27.) Run via
 * `pnpm gate:reviews`; CI runs it after gate:bodyraw.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const ALLOWED = [join("src", "lib", "reviews")];

const MUTATION =
  /\b(?:prisma|tx|db)\.(review|guestRating)\.(?:update|updateMany|upsert|create|createMany|delete|deleteMany)\s*\(/g;

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
    const line = code.slice(0, m.index).split("\n").length;
    violations.push(`${rel}:${line} — writes ${m[1]} directly`);
  }
}

if (violations.length > 0) {
  console.error("✖ Direct Review / GuestRating writes found outside lib/reviews:\n");
  for (const v of violations) console.error("  " + v);
  console.error(
    "\nReview and GuestRating are written ONLY through src/lib/reviews (CLAUDE.md\n" +
      "rule 2). Call submitReview / removeReview / rateGuest instead.",
  );
  process.exit(1);
}

console.log("✓ No direct Review / GuestRating writes outside lib/reviews.");
