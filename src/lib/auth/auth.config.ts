import type { NextAuthConfig } from "next-auth";
import Line from "next-auth/providers/line";

import { env } from "@/lib/env";

/**
 * Edge-safe Auth.js config (ADR-007): providers + pages only. Intentionally
 * imports NO Prisma / Node-only modules so it stays bundleable for the edge
 * runtime. The adapter, database-session strategy, and session callback live
 * in `auth.ts` (Node runtime).
 *
 * `LINE_CLIENT_ID/SECRET` are passed explicitly — Auth.js v5 only auto-infers
 * `AUTH_LINE_ID/AUTH_LINE_SECRET`, and CLAUDE.md rule 4 requires config via
 * `env.ts` anyway.
 */
export const authConfig = {
  providers: [
    Line({
      clientId: env.LINE_CLIENT_ID,
      clientSecret: env.LINE_CLIENT_SECRET,
      authorization: { params: { scope: "profile openid email" } },
      profile(profile) {
        // LINE OIDC id_token claims: sub (LINE userId), name, picture; email
        // only if the channel has Email-permission approval (usually absent).
        // Returned via an intermediate object so `lineUserId` rides along to
        // the adapter's createUser without tripping excess-property checks.
        const user = {
          id: profile.sub,
          name: profile.name ?? "LINE user", // mapped to required displayName
          email: profile.email ?? null,
          image: profile.picture ?? null,
          lineUserId: profile.sub,
        };
        return user;
      },
    }),
  ],
  pages: { signIn: "/sign-in" },
} satisfies NextAuthConfig;
