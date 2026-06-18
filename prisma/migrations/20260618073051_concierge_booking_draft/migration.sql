-- CreateTable
CREATE TABLE "ConciergeBookingDraft" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "guests" INTEGER NOT NULL,
    "priceLines" JSONB NOT NULL,
    "totalSatang" INTEGER NOT NULL,
    "commissionSatang" INTEGER NOT NULL,
    "cancellationTier" "CancellationTier" NOT NULL,
    "guestNoteToHost" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmTokenHash" TEXT,
    "confirmTokenExpiresAt" TIMESTAMP(3),
    "consumedBookingId" TEXT,

    CONSTRAINT "ConciergeBookingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConciergeBookingDraft_userId_idx" ON "ConciergeBookingDraft"("userId");

-- AddForeignKey
ALTER TABLE "ConciergeBookingDraft" ADD CONSTRAINT "ConciergeBookingDraft_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConciergeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
