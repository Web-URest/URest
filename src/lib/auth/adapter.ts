import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterUser } from "@auth/core/adapters";
import type { PrismaClient } from "@prisma/client";

/**
 * Custom Prisma adapter (ADR-007/010 + ADR-011).
 *
 * The stock `@auth/prisma-adapter` writes `name` + `emailVerified`, columns our
 * `User` model deliberately does NOT have (it has a REQUIRED `displayName` and
 * no `emailVerified` — DATA_MODEL.md). So a fresh LINE login on the stock
 * adapter throws. We wrap it and override only the methods that touch the
 * absent columns or carry `lineUserId`; Account/Session/VerificationToken
 * methods are inherited unchanged (those tables match the stock shape).
 *
 * Mapping: `displayName ↔ name`, `emailVerified` always `null`, `lineUserId`
 * passed through (set from the LINE `sub` in `auth.config.ts` `profile()`).
 */

/** The `User` columns these mappers read (a subset of the Prisma row). */
export type MappableUser = {
  id: string;
  displayName: string;
  email: string | null;
  image: string | null;
  lineUserId: string | null;
  phoneVerifiedAt: Date | null;
};

/** Map a Prisma `User` row to the `AdapterUser` shape Auth.js expects. */
export function toAdapterUser(u: MappableUser): AdapterUser {
  return {
    id: u.id,
    name: u.displayName, // name ← displayName
    email: u.email ?? "", // AdapterUser.email is a required string
    emailVerified: null, // no column — Auth.js email-verification unused
    image: u.image,
    lineUserId: u.lineUserId,
    phoneVerifiedAt: u.phoneVerifiedAt,
  };
}

export function CustomPrismaAdapter(prisma: PrismaClient): Adapter {
  const base = PrismaAdapter(prisma);

  return {
    ...base,

    async createUser(user) {
      const created = await prisma.user.create({
        data: {
          displayName: user.name ?? "LINE user", // required, never undefined
          email: user.email || null,
          image: user.image ?? null,
          lineUserId: user.lineUserId ?? null,
        },
      });
      return toAdapterUser(created);
    },

    async updateUser({ id, ...data }) {
      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...(data.name != null ? { displayName: data.name } : {}),
          ...(data.email !== undefined ? { email: data.email || null } : {}),
          ...(data.image !== undefined ? { image: data.image } : {}),
          // emailVerified intentionally dropped — no column.
        },
      });
      return toAdapterUser(updated);
    },

    async getUser(id) {
      const u = await prisma.user.findUnique({ where: { id } });
      return u ? toAdapterUser(u) : null;
    },

    async getUserByEmail(email) {
      const u = await prisma.user.findUnique({ where: { email } });
      return u ? toAdapterUser(u) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const account = await prisma.account.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        include: { user: true },
      });
      return account ? toAdapterUser(account.user) : null;
    },

    async getSessionAndUser(sessionToken) {
      // Hot path under database sessions — runs on every authed request. The
      // stock version returns the raw Prisma row (no `name`/`emailVerified`),
      // which fails the AdapterUser type, so it must be overridden.
      const session = await prisma.session.findUnique({
        where: { sessionToken },
        include: { user: true },
      });
      if (!session) return null;
      const { user, ...sessionRow } = session;
      return {
        session: {
          sessionToken: sessionRow.sessionToken,
          userId: sessionRow.userId,
          expires: sessionRow.expires,
        },
        user: toAdapterUser(user),
      };
    },
  };
}
