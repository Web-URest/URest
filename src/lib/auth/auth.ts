import NextAuth from "next-auth";

import { env } from "@/lib/env";
import { prisma } from "@/lib/db";

import { CustomPrismaAdapter } from "./adapter";
import { authConfig } from "./auth.config";

/**
 * Node-runtime Auth.js instance (ADR-004/007/010).
 *
 * - Database sessions (NOT jwt): suspending/banning a user deletes their
 *   sessions and takes effect immediately (ADR-010).
 * - `trustHost: true`: mandatory off-Vercel (Railway) — Auth.js otherwise
 *   throws `UntrustedHost` because it can't auto-detect the deployment host.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: CustomPrismaAdapter(prisma),
  session: { strategy: "database" },
  trustHost: true,
  secret: env.AUTH_SECRET,
  callbacks: {
    // Database strategy: receives the AdapterUser, not a JWT token.
    session({ session, user }) {
      session.user.id = user.id;
      session.user.lineUserId = user.lineUserId ?? null;
      session.user.phoneVerifiedAt = user.phoneVerifiedAt ?? null;
      return session;
    },
  },
});
