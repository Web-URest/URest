import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { env } from "@/lib/env";

/**
 * Edge-safe Auth.js config (ADR-007): providers + pages only. Intentionally
 * imports NO Prisma / Node-only modules so it stays bundleable for the edge
 * runtime. The adapter, database-session strategy, and session callback live
 * in `auth.ts` (Node runtime).
 *
 * Google is the active login provider (ADR-007 sanctions email/Google/Facebook/
 * LINE; LINE is disabled for now). Credentials are passed explicitly from
 * `env.ts` (CLAUDE.md rule 4). The default Google profile maps sub→id, name,
 * email, picture→image; no `lineUserId` is set, so the adapter stores it null
 * (`User.lineUserId` is nullable).
 */
export const authConfig = {
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: { signIn: "/sign-in" },
} satisfies NextAuthConfig;
