-- Merge AdminUser into User (role=ADMIN) — ADR-007/010, DATA_MODEL.md.
--
-- HAND-AUTHORED destructive migration (Aok-integrated; shared-file protocol).
-- Prisma's auto-diff for a dropped-model-with-relations would emit a bare DROP +
-- FK redefs WITHOUT the backfill/guards below and would null out money authorship
-- (Payout/PayoutHold/AuditLog) — so the body is written by hand.
--
-- Strategy: REUSE each AdminUser.id as the new User.id, so every one of the 7 FK
-- columns already holds a valid User.id after the backfill — no money-row UPDATE,
-- no id-translation. Guarded by fail-loud email/id collision checks. The whole
-- file runs in one transaction (Prisma wraps it), so any failure rolls back.

-- 1. role enum
CREATE TYPE "UserRole" AS ENUM ('GUEST', 'HOST', 'ADMIN');

-- 2. new columns on User (creds nullable; non-null only for ADMIN, CHECK in step 9)
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'GUEST';
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN "totpSecretEnc" TEXT;

-- 3. label existing hosts (any User who owns a Listing). Admins own no listings.
UPDATE "User" SET "role" = 'HOST'
WHERE "id" IN (SELECT DISTINCT "hostId" FROM "Listing");

-- 4. FAIL LOUD on collisions — never silently merge a staff identity into a consumer.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "AdminUser" a
    JOIN "User" u ON lower(u."email") = lower(a."email")
  ) THEN
    RAISE EXCEPTION 'Admin/consumer email collision; resolve manually before merge';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "AdminUser" a JOIN "User" u ON u."id" = a."id"
  ) THEN
    RAISE EXCEPTION 'AdminUser.id collides with an existing User.id; aborting';
  END IF;
END $$;

-- 5. backfill admins as User rows (reuse id; fold disabledAt -> suspendedAt)
INSERT INTO "User"
  ("id", "displayName", "email", "role", "passwordHash", "totpSecretEnc", "suspendedAt", "createdAt", "updatedAt")
SELECT
  a."id", a."displayName", a."email", 'ADMIN'::"UserRole",
  a."passwordHash", a."totpSecretEnc", a."disabledAt", a."createdAt", now()
FROM "AdminUser" a;

-- 6. drop the 7 FK constraints that point at AdminUser
ALTER TABLE "KycSubmission" DROP CONSTRAINT "KycSubmission_reviewedByAdminId_fkey";
ALTER TABLE "AuditLog"      DROP CONSTRAINT "AuditLog_adminId_fkey";
ALTER TABLE "Payout"        DROP CONSTRAINT "Payout_paidByAdminId_fkey";
ALTER TABLE "PayoutHold"    DROP CONSTRAINT "PayoutHold_createdByAdminId_fkey";
ALTER TABLE "PayoutHold"    DROP CONSTRAINT "PayoutHold_releasedByAdminId_fkey";
ALTER TABLE "Review"        DROP CONSTRAINT "Review_removedByAdminId_fkey";
ALTER TABLE "Report"        DROP CONSTRAINT "Report_triageByAdminId_fkey";

-- 7. (no value UPDATE needed — reuse-id keeps every FK value a valid User.id)

-- 8. re-add the 7 FKs pointing at User, preserving each ON DELETE rule
--    (RESTRICT: AuditLog.adminId, PayoutHold.createdByAdminId — money paper trail)
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutHold" ADD CONSTRAINT "PayoutHold_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KycSubmission" ADD CONSTRAINT "KycSubmission_reviewedByAdminId_fkey"
  FOREIGN KEY ("reviewedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_paidByAdminId_fkey"
  FOREIGN KEY ("paidByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayoutHold" ADD CONSTRAINT "PayoutHold_releasedByAdminId_fkey"
  FOREIGN KEY ("releasedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_removedByAdminId_fkey"
  FOREIGN KEY ("removedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_triageByAdminId_fkey"
  FOREIGN KEY ("triageByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 9. admin rows must carry credentials — a bare role-flip stays un-loginable
--    (login needs passwordHash + totpSecretEnc). Registry: DATA_MODEL.md §constraints.
ALTER TABLE "User" ADD CONSTRAINT "user_admin_requires_credentials"
  CHECK ("role" <> 'ADMIN' OR ("passwordHash" IS NOT NULL AND "totpSecretEnc" IS NOT NULL));

-- 10. drop the orphaned table
DROP TABLE "AdminUser";
