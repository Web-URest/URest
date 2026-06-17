-- CreateEnum
CREATE TYPE "UnansweredQuestionStatus" AS ENUM ('OPEN', 'CONVERTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "ConciergeSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "scopedListingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConciergeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciergeMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConciergeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciergeUsage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadInputTokens" INTEGER NOT NULL DEFAULT 0,
    "costSatang" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConciergeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnansweredQuestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "listingId" TEXT,
    "questionText" TEXT NOT NULL,
    "status" "UnansweredQuestionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnansweredQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConciergeSession_userId_createdAt_idx" ON "ConciergeSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ConciergeMessage_sessionId_createdAt_idx" ON "ConciergeMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ConciergeMessage_createdAt_idx" ON "ConciergeMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ConciergeUsage_sessionId_idx" ON "ConciergeUsage"("sessionId");

-- CreateIndex
CREATE INDEX "ConciergeUsage_createdAt_idx" ON "ConciergeUsage"("createdAt");

-- CreateIndex
CREATE INDEX "UnansweredQuestion_status_createdAt_idx" ON "UnansweredQuestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UnansweredQuestion_listingId_status_idx" ON "UnansweredQuestion"("listingId", "status");

-- AddForeignKey
ALTER TABLE "ConciergeSession" ADD CONSTRAINT "ConciergeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciergeMessage" ADD CONSTRAINT "ConciergeMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConciergeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciergeUsage" ADD CONSTRAINT "ConciergeUsage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConciergeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnansweredQuestion" ADD CONSTRAINT "UnansweredQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConciergeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
