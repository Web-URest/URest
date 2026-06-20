/**
 * PDPA data export (#35, PRODUCT_FLOWS §3.7): a complete archive of the user's own
 * data as a single JSON object. Read-only. Payout bank-account details are
 * field-encrypted (ADR-010, single audited decrypt path) and excluded here.
 */
import type { Booking, Consent, GuestRating, Report, Review } from "@prisma/client";

import { prisma } from "@/lib/db";
import { exportSentMessages, type ExportedMessage } from "@/lib/messaging/export";

export interface UserExport {
  exportedAt: string;
  user: {
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    image: string | null;
    lineUserId: string | null;
    phoneVerifiedAt: Date | null;
    createdAt: Date;
    suspendedAt: Date | null;
  };
  savedVillas: { listingId: string; createdAt: Date }[];
  bookings: Booking[];
  messagesSent: ExportedMessage[];
  reviews: Review[];
  guestRatingsReceived: GuestRating[];
  reports: Report[];
  consents: Consent[];
  kycSubmissions: { id: string; status: string; submittedAt: Date; reviewedAt: Date | null }[];
  conciergeSessions: {
    id: string;
    createdAt: Date;
    messages: { role: string; content: string; createdAt: Date }[];
  }[];
  _note: string;
}

export async function exportUserData(userId: string): Promise<UserExport> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      email: true,
      phone: true,
      image: true,
      lineUserId: true,
      phoneVerifiedAt: true,
      createdAt: true,
      suspendedAt: true,
      savedVillas: true,
      bookings: true,
      reviewsWritten: true,
      guestRatingsReceived: true,
      reportsSubmitted: true,
      consents: true,
      kycSubmissions: { select: { id: true, status: true, submittedAt: true, reviewedAt: true } },
      conciergesessions: {
        select: {
          id: true,
          createdAt: true,
          messages: { select: { role: true, content: true, createdAt: true } },
        },
      },
    },
  });
  if (!u) throw new Error(`exportUserData: user ${userId} not found`);

  const messagesSent = await exportSentMessages(userId);

  return {
    exportedAt: new Date().toISOString(),
    user: {
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      phone: u.phone,
      image: u.image,
      lineUserId: u.lineUserId,
      phoneVerifiedAt: u.phoneVerifiedAt,
      createdAt: u.createdAt,
      suspendedAt: u.suspendedAt,
    },
    savedVillas: u.savedVillas,
    bookings: u.bookings,
    messagesSent,
    reviews: u.reviewsWritten,
    guestRatingsReceived: u.guestRatingsReceived,
    reports: u.reportsSubmitted,
    consents: u.consents,
    kycSubmissions: u.kycSubmissions,
    conciergeSessions: u.conciergesessions,
    _note:
      "Payout bank-account details are field-encrypted (ADR-010, single audited decryption path) and excluded from self-serve export — contact support to retrieve them.",
  };
}
