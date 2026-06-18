/**
 * Per-booking messaging domain (PRODUCT_FLOWS §3.5, issue #24). The ONLY module
 * that writes `Message`/`MessageThread` — and the ONLY place `bodyRaw` is written
 * (a grep gate enforces no consumer read path; the future admin dispute view, #27,
 * will be the sole reader). Masking is applied AT WRITE based on the booking's
 * confirm state, so pre-CONFIRMED messages stay masked forever.
 */
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

import { maskBody } from "./mask";

export type MessagingErrorReason = "BOOKING_NOT_FOUND" | "NOT_PARTICIPANT" | "EMPTY_BODY";

export class MessagingError extends Error {
  constructor(public readonly reason: MessagingErrorReason) {
    super(reason);
    this.name = "MessagingError";
  }
}

const THROTTLE_MS = 10 * 60 * 1000;

type Participants = {
  bookingId: string;
  guestId: string;
  guestName: string;
  hostId: string;
  hostName: string;
  listingTitle: string;
  contactUnmaskedAt: Date | null;
};

async function loadParticipants(bookingId: string): Promise<Participants> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      userId: true,
      contactUnmaskedAt: true,
      user: { select: { displayName: true } },
      listing: { select: { title: true, hostId: true, host: { select: { displayName: true } } } },
    },
  });
  if (!b) throw new MessagingError("BOOKING_NOT_FOUND");
  return {
    bookingId: b.id,
    guestId: b.userId,
    guestName: b.user.displayName,
    hostId: b.listing.hostId,
    hostName: b.listing.host.displayName,
    listingTitle: b.listing.title,
    contactUnmaskedAt: b.contactUnmaskedAt,
  };
}

function assertParticipant(p: Participants, userId: string): void {
  if (userId !== p.guestId && userId !== p.hostId) throw new MessagingError("NOT_PARTICIPANT");
}

/** Lazy thread open (an empty thread is invisible; avoids coupling lib/booking). */
export function getOrCreateThread(bookingId: string) {
  return prisma.messageThread.upsert({ where: { bookingId }, create: { bookingId }, update: {} });
}

/**
 * Post a message. Participant-gated. Masking at write: unmasked once the booking
 * is CONFIRMED (`contactUnmaskedAt`), else redacted via `maskBody`. Then a single
 * throttled LINE push to the other party (1/thread/10min, CAS-claimed).
 */
export async function sendMessage(
  input: { bookingId: string; senderId: string; body: string },
  now: Date,
): Promise<void> {
  const p = await loadParticipants(input.bookingId);
  assertParticipant(p, input.senderId);
  const body = input.body.trim();
  if (!body) throw new MessagingError("EMPTY_BODY");

  const { masked, wasMasked } = p.contactUnmaskedAt ? { masked: body, wasMasked: false } : maskBody(body);

  const thread = await getOrCreateThread(input.bookingId);
  await prisma.message.create({
    data: { threadId: thread.id, senderId: input.senderId, bodyRaw: body, bodyMasked: masked, wasMasked },
  });

  const claim = await prisma.messageThread.updateMany({
    where: {
      id: thread.id,
      OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: new Date(now.getTime() - THROTTLE_MS) } }],
    },
    data: { lastNotifiedAt: now },
  });
  if (claim.count === 1) {
    const recipientId = input.senderId === p.guestId ? p.hostId : p.guestId;
    const senderName = input.senderId === p.guestId ? p.guestName : p.hostName;
    await notify(recipientId, "MESSAGE_NEW", { senderName, listingTitle: p.listingTitle, bookingId: p.bookingId });
  }
}

/** Load a thread for one participant. Selects bodyMasked ONLY (never bodyRaw); marks inbound read. */
export async function loadThreadForViewer(bookingId: string, viewerId: string) {
  const p = await loadParticipants(bookingId);
  assertParticipant(p, viewerId);
  const thread = await getOrCreateThread(bookingId);

  const messages = await prisma.message.findMany({
    where: { threadId: thread.id },
    select: { id: true, senderId: true, bodyMasked: true, createdAt: true, readAt: true },
    orderBy: { createdAt: "asc" },
  });

  await prisma.message.updateMany({
    where: { threadId: thread.id, senderId: { not: viewerId }, readAt: null },
    data: { readAt: new Date() },
  });

  return {
    bookingId: p.bookingId,
    listingTitle: p.listingTitle,
    contactUnmasked: p.contactUnmaskedAt !== null,
    otherPartyName: viewerId === p.guestId ? p.hostName : p.guestName,
    viewerId,
    messages,
  };
}

/** Inbox: the user's threads (as guest or host) with last-message preview + unread count, newest first. */
export async function listThreadsForUser(userId: string) {
  const threads = await prisma.messageThread.findMany({
    where: { booking: { OR: [{ userId }, { listing: { hostId: userId } }] } },
    select: {
      bookingId: true,
      booking: {
        select: {
          userId: true,
          user: { select: { displayName: true } },
          listing: { select: { title: true, host: { select: { displayName: true } } } },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { bodyMasked: true, createdAt: true } },
      _count: { select: { messages: { where: { senderId: { not: userId }, readAt: null } } } },
    },
  });

  return threads
    .map((t) => ({
      bookingId: t.bookingId,
      listingTitle: t.booking.listing.title,
      otherPartyName: userId === t.booking.userId ? t.booking.listing.host.displayName : t.booking.user.displayName,
      lastMessage: t.messages[0]?.bodyMasked ?? null,
      lastMessageAt: t.messages[0]?.createdAt ?? null,
      unread: t._count.messages,
    }))
    .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
}
