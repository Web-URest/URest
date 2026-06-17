-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'AWAITING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'DECLINED', 'EXPIRED', 'CANCELLED_BY_GUEST', 'CANCELLED_BY_HOST', 'DISPUTED');

-- CreateEnum
CREATE TYPE "EscrowState" AS ENUM ('NONE', 'HELD', 'RELEASABLE', 'FROZEN', 'PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PROMPTPAY', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LedgerCause" AS ENUM ('CHARGE_WEBHOOK', 'RELEASE_CHECKOUT', 'HOLD_DISPUTE_OPENED', 'HOLD_BOOKING_REPORT', 'HOLD_ADMIN_MANUAL', 'RELEASE_HOLD_LIFTED', 'PAID_ADMIN_TRANSFER', 'REFUND_GUEST_TIER', 'REFUND_HOST_CANCELLED', 'REFUND_DISPUTE_FULL', 'REFUND_DISPUTE_PARTIAL');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED_RELEASED', 'RESOLVED_PARTIAL', 'RESOLVED_REFUNDED');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('DOESNT_MATCH_LISTING', 'CLEANLINESS', 'SAFETY', 'HOST_BEHAVIOR', 'SUSPECTED_FRAUD', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('RECEIVED', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "HostStrikeReason" AS ENUM ('HOST_CANCELLED', 'STALE_CALENDAR_DOUBLE_BOOKING');

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "bookingMode" "BookingMode" NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "respondBy" TIMESTAMP(3),
    "payBy" TIMESTAMP(3),
    "priceLines" JSONB NOT NULL,
    "totalSatang" INTEGER NOT NULL,
    "commissionSatang" INTEGER NOT NULL,
    "cancellationTier" "CancellationTier" NOT NULL,
    "houseRulesText" TEXT,
    "escrowState" "EscrowState" NOT NULL DEFAULT 'NONE',
    "contactUnmaskedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingCodeCounter" (
    "yearMonth" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BookingCodeCounter_pkey" PRIMARY KEY ("yearMonth")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "opnChargeId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "qrExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "opnEventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "fromState" "EscrowState",
    "toState" "EscrowState" NOT NULL,
    "cause" "LedgerCause" NOT NULL,
    "causeRef" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "refundSatang" INTEGER NOT NULL,
    "retainedHostSatang" INTEGER NOT NULL,
    "retainedPlatformSatang" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "payoutAccountId" TEXT NOT NULL,
    "hostAmountSatang" INTEGER NOT NULL,
    "slipRef" TEXT,
    "paidByAdminId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutHold" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "hostUserId" TEXT,
    "reason" TEXT NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "releasedByAdminId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostStrike" (
    "id" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "bookingId" TEXT,
    "reason" "HostStrikeReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostStrike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "bodyRaw" TEXT NOT NULL,
    "bodyMasked" TEXT NOT NULL,
    "wasMasked" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "overall" INTEGER NOT NULL,
    "cleanliness" INTEGER NOT NULL,
    "accuracyToPhotos" INTEGER NOT NULL,
    "hostResponsiveness" INTEGER NOT NULL,
    "valueForMoney" INTEGER NOT NULL,
    "text" TEXT,
    "photoKeys" TEXT[],
    "removedByAdminId" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestRating" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "hostRaterId" TEXT NOT NULL,
    "guestRateeId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "partialRefundPct" INTEGER,
    "guestAppealedAt" TIMESTAMP(3),
    "hostAppealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "category" "ReportCategory" NOT NULL,
    "text" TEXT NOT NULL,
    "photoKeys" TEXT[],
    "bookingId" TEXT,
    "listingId" TEXT,
    "reviewId" TEXT,
    "reportedUserId" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'RECEIVED',
    "resolvedReason" TEXT,
    "triageByAdminId" TEXT,
    "triageAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_code_key" ON "Booking"("code");

-- CreateIndex
CREATE INDEX "Booking_status_respondBy_idx" ON "Booking"("status", "respondBy");

-- CreateIndex
CREATE INDEX "Booking_status_payBy_idx" ON "Booking"("status", "payBy");

-- CreateIndex
CREATE INDEX "Booking_escrowState_checkOut_idx" ON "Booking"("escrowState", "checkOut");

-- CreateIndex
CREATE INDEX "Booking_listingId_checkIn_idx" ON "Booking"("listingId", "checkIn");

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_opnChargeId_key" ON "Payment"("opnChargeId");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_opnEventId_key" ON "WebhookEvent"("opnEventId");

-- CreateIndex
CREATE INDEX "LedgerEntry_bookingId_createdAt_idx" ON "LedgerEntry"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_bookingId_key" ON "Refund"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_bookingId_key" ON "Payout"("bookingId");

-- CreateIndex
CREATE INDEX "Payout_payoutAccountId_idx" ON "Payout"("payoutAccountId");

-- CreateIndex
CREATE INDEX "PayoutHold_bookingId_idx" ON "PayoutHold"("bookingId");

-- CreateIndex
CREATE INDEX "PayoutHold_hostUserId_idx" ON "PayoutHold"("hostUserId");

-- CreateIndex
CREATE INDEX "HostStrike_hostUserId_createdAt_idx" ON "HostStrike"("hostUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageThread_bookingId_key" ON "MessageThread"("bookingId");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestRating_bookingId_key" ON "GuestRating"("bookingId");

-- CreateIndex
CREATE INDEX "GuestRating_guestRateeId_idx" ON "GuestRating"("guestRateeId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_bookingId_key" ON "Dispute"("bookingId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_payoutAccountId_fkey" FOREIGN KEY ("payoutAccountId") REFERENCES "PayoutAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_paidByAdminId_fkey" FOREIGN KEY ("paidByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutHold" ADD CONSTRAINT "PayoutHold_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutHold" ADD CONSTRAINT "PayoutHold_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutHold" ADD CONSTRAINT "PayoutHold_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutHold" ADD CONSTRAINT "PayoutHold_releasedByAdminId_fkey" FOREIGN KEY ("releasedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostStrike" ADD CONSTRAINT "HostStrike_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostStrike" ADD CONSTRAINT "HostStrike_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_removedByAdminId_fkey" FOREIGN KEY ("removedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRating" ADD CONSTRAINT "GuestRating_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRating" ADD CONSTRAINT "GuestRating_hostRaterId_fkey" FOREIGN KEY ("hostRaterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRating" ADD CONSTRAINT "GuestRating_guestRateeId_fkey" FOREIGN KEY ("guestRateeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_triageByAdminId_fkey" FOREIGN KEY ("triageByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Raw-SQL constraints hand-appended from the docs/DATA_MODEL.md constraint
-- registry (Prisma cannot express these). They are the last line of defense;
-- lib/booking + lib/ledger run friendly app-level checks first.
-- ─────────────────────────────────────────────────────────────────────────────

-- №1 Booking: a listing cannot have two bookings whose date ranges overlap while
-- either is in an active status. Makes double-bookings impossible even under
-- instant-book races (DATA_MODEL.md constraint №1). btree_gist is created by the
-- init migration; the IF NOT EXISTS keeps this migration self-contained.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Booking" ADD CONSTRAINT "booking_no_double_booking"
  EXCLUDE USING gist ("listingId" WITH =, daterange("checkIn", "checkOut") WITH &&)
  WHERE (status IN ('AWAITING_PAYMENT', 'CONFIRMED', 'CHECKED_IN'));

-- №3 Report: exactly one polymorphic target (DATA_MODEL.md constraint №3).
ALTER TABLE "Report" ADD CONSTRAINT "report_exactly_one_target"
  CHECK (num_nonnulls("bookingId", "listingId", "reviewId", "reportedUserId") = 1);

-- №4 PayoutHold: scope is exactly one of a single booking OR a whole host
-- (DATA_MODEL.md constraint №4).
ALTER TABLE "PayoutHold" ADD CONSTRAINT "payout_hold_exactly_one_scope"
  CHECK (num_nonnulls("bookingId", "hostUserId") = 1);
