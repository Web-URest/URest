/**
 * THE sanctioned `Message.bodyRaw` read path (ADR-011 №5, PRODUCT_FLOWS §5.3): the
 * admin dispute case view. The booking chat is the dispute evidence, so an admin
 * sees the UNMASKED bodies — but every reveal is written to the AuditLog (who/when),
 * mirroring `revealAccountNumber`'s audit-on-every-access. This file lives inside
 * `src/lib/messaging` so the `check-bodyraw-reads.mjs` gate keeps allowing it; no
 * other module may touch `bodyRaw`.
 */
import type { AdminPrincipal } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

import { getOrCreateThread, MessagingError } from "./thread";

export interface DisputeThreadRaw {
  bookingId: string;
  guestId: string;
  guestName: string;
  hostName: string;
  /** `body` is the UNMASKED message text. The `bodyRaw` DB identifier never leaves
   * this module (the grep gate enforces it); consumers render this revealed `body`. */
  messages: { id: string; senderId: string; body: string; wasMasked: boolean; createdAt: Date }[];
}

/**
 * Load a booking's message thread with UNMASKED bodies for the admin dispute view,
 * writing a `DISPUTE_THREAD_REVEALED` audit row on every call. The thread is
 * lazily ensured (an empty thread is invisible to participants) so the reveal is
 * always anchored to a stable thread id.
 */
export async function readDisputeThreadRaw(
  admin: AdminPrincipal,
  bookingId: string,
): Promise<DisputeThreadRaw> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      userId: true,
      user: { select: { displayName: true } },
      listing: { select: { host: { select: { displayName: true } } } },
    },
  });
  if (!booking) throw new MessagingError("BOOKING_NOT_FOUND");

  const thread = await getOrCreateThread(bookingId);
  const rows = await prisma.message.findMany({
    where: { threadId: thread.id },
    select: { id: true, senderId: true, bodyRaw: true, wasMasked: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "DISPUTE_THREAD_REVEALED",
      targetType: "MessageThread",
      targetId: thread.id,
    },
  });

  return {
    bookingId,
    guestId: booking.userId,
    guestName: booking.user.displayName,
    hostName: booking.listing.host.displayName,
    messages: rows.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: m.bodyRaw,
      wasMasked: m.wasMasked,
      createdAt: m.createdAt,
    })),
  };
}
