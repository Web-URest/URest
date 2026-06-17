import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export async function saveVilla(userId: string, listingId: string): Promise<void> {
  try {
    await prisma.savedVilla.create({ data: { userId, listingId } });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return; // already saved — idempotent
    }
    throw e;
  }
}

export async function unsaveVilla(userId: string, listingId: string): Promise<void> {
  try {
    await prisma.savedVilla.delete({
      where: { userId_listingId: { userId, listingId } },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return; // not saved — idempotent
    }
    throw e;
  }
}

/** Return the subset of `listingIds` that `userId` has saved. */
export async function getSavedVillaIds(
  userId: string,
  listingIds: string[],
): Promise<Set<string>> {
  if (listingIds.length === 0) return new Set();
  const rows = await prisma.savedVilla.findMany({
    where: { userId, listingId: { in: listingIds } },
    select: { listingId: true },
  });
  return new Set(rows.map((r) => r.listingId));
}

export async function getSavedVillas(userId: string) {
  return prisma.savedVilla.findMany({
    where: { userId, listing: { status: "PUBLISHED" } },
    orderBy: { createdAt: "desc" },
    include: {
      listing: {
        include: {
          region: { select: { nameTh: true, slug: true } },
          photos: { where: { isCover: true }, take: 1 },
        },
      },
    },
  });
}
