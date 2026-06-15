import type { DefaultSession } from "next-auth";

/**
 * Module augmentation for Auth.js (ADR-007/010).
 *
 * `Session.user` carries the fields our server guards read; `AdapterUser`
 * carries the columns our custom Prisma adapter maps from `User` (which has no
 * `name`/`emailVerified` columns — see `src/lib/auth/adapter.ts`).
 */
declare module "next-auth" {
  interface User {
    lineUserId?: string | null;
    phoneVerifiedAt?: Date | null;
  }

  interface Session {
    user: {
      id: string;
      lineUserId: string | null;
      phoneVerifiedAt: Date | null;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    lineUserId: string | null;
    phoneVerifiedAt: Date | null;
  }
}
