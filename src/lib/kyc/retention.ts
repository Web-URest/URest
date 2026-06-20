/**
 * Rejected-KYC purge cron (#35, ADR-010 §6): when a submission is rejected/withdrawn
 * its documents get `purgeAfter = now + 90d` (lib/kyc/review). This sweep deletes the
 * R2 object AND the row once due. Per-doc isolation so one R2 failure doesn't abort
 * the batch (the row is left for the next tick to retry).
 */
import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage/r2";

export async function purgeRejectedKycDocs(now: Date): Promise<number> {
  const docs = await prisma.kycDocument.findMany({
    where: { purgeAfter: { lt: now } },
    select: { id: true, r2Key: true },
  });
  let purged = 0;
  for (const doc of docs) {
    try {
      await deleteObject({ bucket: "private", key: doc.r2Key });
      await prisma.kycDocument.delete({ where: { id: doc.id } });
      purged++;
    } catch (err) {
      console.error(`[cron] purge kyc doc ${doc.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return purged;
}
