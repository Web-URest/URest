#!/usr/bin/env node
/**
 * Grep gate (issue #24, ADR-011 №5): `Message.bodyRaw` holds the UNMASKED message
 * body. It may be referenced ONLY inside `src/lib/messaging` (where it's written).
 * No page, component, action, or loader may read it — participants always read
 * `bodyMasked`; the raw text is for the future admin dispute view (#27), which will
 * add its own path to ALLOWED when built. Mirrors scripts/check-status-writes.mjs.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const ALLOWED = [join("src", "lib", "messaging")];

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
  for (const m of code.matchAll(/\bbodyRaw\b/g)) {
    const line = code.slice(0, m.index).split("\n").length;
    violations.push(`${rel}:${line} — references Message.bodyRaw`);
  }
}

if (violations.length > 0) {
  console.error("✖ Message.bodyRaw referenced outside src/lib/messaging:\n");
  for (const v of violations) console.error("  " + v);
  console.error(
    "\nParticipants read bodyMasked. bodyRaw is the unmasked body — admin-dispute-only\n" +
      "(ADR-011 №5, #24). Read bodyMasked instead, or add the dispute path to ALLOWED (#27).",
  );
  process.exit(1);
}

console.log("✓ No Message.bodyRaw reads outside src/lib/messaging.");
