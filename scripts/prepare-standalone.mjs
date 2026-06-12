// Next.js `output: "standalone"` doesn't copy public/ and .next/static into
// the standalone bundle — this postbuild step does, so Railway can run
// `node .next/standalone/server.js` directly (ADR-002).
import { cp } from "node:fs/promises";
import { existsSync } from "node:fs";

if (existsSync(".next/standalone")) {
  if (existsSync("public")) {
    await cp("public", ".next/standalone/public", { recursive: true });
  }
  await cp(".next/static", ".next/standalone/.next/static", {
    recursive: true,
  });
  console.log("standalone bundle prepared (public/ + static assets copied)");
}
