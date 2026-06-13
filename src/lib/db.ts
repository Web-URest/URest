import { PrismaClient } from "@prisma/client";

import { env } from "@/lib/env";

/**
 * Shared Prisma client (Node runtime only — never import from edge code such as
 * `src/middleware.ts` or `src/lib/auth/auth.config.ts`).
 *
 * The hot-reload guard keeps a single client across dev recompiles so we don't
 * exhaust the Postgres connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
