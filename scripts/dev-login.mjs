// Dev-only login helper (#17 manual testing). Auth is LINE-OAuth only, which
// can't complete locally without real channel keys — so this mints an Auth.js
// database session for a seeded dev host and prints the cookie to paste.
//
// Usage:  node --env-file=.env scripts/dev-login.mjs [email]   (default dev-host@urest.local)
// Then in the browser at http://localhost:3000, set cookie:
//   authjs.session-token=<printed token>
// (DevTools → Application → Cookies → http://localhost:3000), reload, open /dashboard.
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const email = process.argv[2] ?? "dev-host@urest.local";
const prisma = new PrismaClient();

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No user ${email}. Run pnpm db:seed first.`);
  process.exit(1);
}

const sessionToken = randomUUID();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30d
await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

console.log("\n✅ Dev session created for", email, `(${user.displayName})`);
console.log("\nSet this cookie at http://localhost:3000 then open /dashboard:\n");
console.log("  name:  authjs.session-token");
console.log("  value:", sessionToken);
console.log("\nDevTools → Application → Cookies → http://localhost:3000 → add the row.\n");

await prisma.$disconnect();
