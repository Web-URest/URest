/**
 * KYC submission domain module (issue #13, PRODUCT_FLOWS §4.1 ⑥, ADR-007/010).
 *
 * The ONLY place KYC submission rows, documents, payout accounts, and the
 * KYC_PROCESSING consent are written (CLAUDE.md rule 2). Server actions call
 * these functions; pages/components never touch the rows directly.
 *
 * The bank account number is field-encrypted here via `encryptField`
 * (`accountNumberEnc`, ADR-010) — plaintext never reaches the database, the
 * logs, or the client. The listing's DRAFT → PENDING_REVIEW flip stays in
 * `lib/listing` (`submitForReview`), called by the action after `finalizeKyc`.
 */

import type { KycDocument, KycSubmission } from "@prisma/client";
import { ConsentType, KycDocumentType, KycStatus } from "@prisma/client";

import { encryptField } from "@/lib/crypto";
import { prisma } from "@/lib/db";

/** Documents a host must upload before a listing can be submitted (§4.1 ⑥). */
export const REQUIRED_DOC_TYPES = [
  KycDocumentType.THAI_ID,
  KycDocumentType.RIGHT_TO_RENT,
  KycDocumentType.SELFIE,
] as const;

/** Consent policy version recorded at KYC submit (append-only, ADR-010 §5). */
export const KYC_POLICY_VERSION = "2026-06-12";

export type KycErrorReason =
  | "NOT_FOUND"
  | "NOT_OWNER"
  | "MISSING_DOCS"
  | "MISSING_PAYOUT";

export class KycError extends Error {
  constructor(public readonly reason: KycErrorReason) {
    super(reason);
    this.name = "KycError";
  }
}

export interface PayoutInput {
  bankCode: string;
  accountNumber: string;
  accountName: string;
}

/**
 * The host's in-flight submission for this listing, or a fresh one. Idempotent
 * so re-entering / resuming the wizard reuses the same submission (its id is
 * the R2 key prefix `kyc/{submissionId}/…`, so documents must attach to one row).
 */
export async function getOrCreateSubmission(
  userId: string,
  listingId: string,
): Promise<KycSubmission> {
  const existing = await prisma.kycSubmission.findFirst({
    where: { userId, listingId, status: KycStatus.PENDING_REVIEW },
  });
  if (existing) return existing;
  return prisma.kycSubmission.create({ data: { userId, listingId } });
}

/** Attach an uploaded document (already PUT to the private bucket) to a submission. */
export async function addDocument(
  submissionId: string,
  userId: string,
  type: KycDocumentType,
  r2Key: string,
): Promise<KycDocument> {
  const submission = await prisma.kycSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) throw new KycError("NOT_FOUND");
  if (submission.userId !== userId) throw new KycError("NOT_OWNER");
  return prisma.kycDocument.create({ data: { submissionId, type, r2Key } });
}

/** Remove a document the host re-took (e.g. a failed upload or wrong slot). */
export async function removeDocument(
  submissionId: string,
  userId: string,
  documentId: string,
): Promise<void> {
  const submission = await prisma.kycSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) throw new KycError("NOT_FOUND");
  if (submission.userId !== userId) throw new KycError("NOT_OWNER");
  const doc = await prisma.kycDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.submissionId !== submissionId) throw new KycError("NOT_FOUND");
  await prisma.kycDocument.delete({ where: { id: documentId } });
}

/**
 * Final KYC gate before the listing is submitted: require all `REQUIRED_DOC_TYPES`,
 * persist the payout account with the encrypted number, and record KYC consent —
 * payout write + consent in one transaction. The listing flip is the caller's job.
 */
export async function finalizeKyc(
  userId: string,
  listingId: string,
  payout: PayoutInput,
): Promise<void> {
  const submission = await prisma.kycSubmission.findFirst({
    where: { userId, listingId, status: KycStatus.PENDING_REVIEW },
    include: { documents: true },
  });
  if (!submission) throw new KycError("NOT_FOUND");

  const present = new Set(submission.documents.map((d) => d.type));
  for (const type of REQUIRED_DOC_TYPES) {
    if (!present.has(type)) throw new KycError("MISSING_DOCS");
  }

  const bankCode = payout.bankCode.trim();
  const accountNumber = payout.accountNumber.trim();
  const accountName = payout.accountName.trim();
  if (!bankCode || !accountNumber || !accountName) {
    throw new KycError("MISSING_PAYOUT");
  }

  const accountNumberEnc = encryptField(accountNumber);
  const existingAccount = await prisma.payoutAccount.findFirst({ where: { userId } });

  const payoutWrite = existingAccount
    ? prisma.payoutAccount.update({
        where: { id: existingAccount.id },
        data: { bankCode, accountNumberEnc, accountName },
      })
    : prisma.payoutAccount.create({
        data: { userId, bankCode, accountNumberEnc, accountName },
      });

  const consentWrite = prisma.consent.create({
    data: { userId, type: ConsentType.KYC_PROCESSING, policyVersion: KYC_POLICY_VERSION },
  });

  await prisma.$transaction([payoutWrite, consentWrite]);
}
