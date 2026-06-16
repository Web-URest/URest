import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { randomBytes } from "node:crypto";

vi.mock("@/lib/db", () => ({
  prisma: {
    kycSubmission: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    kycDocument: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    payoutAccount: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    consent: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

import { decryptField } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import {
  addDocument,
  finalizeKyc,
  getOrCreateSubmission,
  KycError,
  REQUIRED_DOC_TYPES,
} from "./submission";

const subFindFirst = prisma.kycSubmission.findFirst as unknown as Mock;
const subFindUnique = prisma.kycSubmission.findUnique as unknown as Mock;
const subCreate = prisma.kycSubmission.create as unknown as Mock;
const docCreate = prisma.kycDocument.create as unknown as Mock;
const payoutFindFirst = prisma.payoutAccount.findFirst as unknown as Mock;
const payoutCreate = prisma.payoutAccount.create as unknown as Mock;
const payoutUpdate = prisma.payoutAccount.update as unknown as Mock;
const consentCreate = prisma.consent.create as unknown as Mock;

const TEST_KEY = randomBytes(32).toString("base64");
beforeEach(() => {
  process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
});
afterEach(() => {
  delete process.env.DATA_ENCRYPTION_KEY;
  vi.clearAllMocks();
});

const payout = { bankCode: "004", accountNumber: "123-4-56789-0", accountName: "สมชาย ใจดี" };
const docsOf = (types: string[]) => types.map((type, i) => ({ id: `d${i}`, type }));

describe("getOrCreateSubmission", () => {
  it("reuses an existing PENDING_REVIEW submission for the listing", async () => {
    subFindFirst.mockResolvedValue({ id: "s1", userId: "u1", listingId: "l1" });
    const s = await getOrCreateSubmission("u1", "l1");
    expect(s.id).toBe("s1");
    expect(subCreate).not.toHaveBeenCalled();
  });

  it("creates a submission when none exists", async () => {
    subFindFirst.mockResolvedValue(null);
    subCreate.mockResolvedValue({ id: "s2", userId: "u1", listingId: "l1" });
    const s = await getOrCreateSubmission("u1", "l1");
    expect(s.id).toBe("s2");
    expect(subCreate).toHaveBeenCalledWith({
      data: { userId: "u1", listingId: "l1" },
    });
  });
});

describe("addDocument", () => {
  it("rejects a submission owned by another user", async () => {
    subFindUnique.mockResolvedValue({ id: "s1", userId: "other" });
    await expect(addDocument("s1", "u1", "THAI_ID", "kyc/s1/x")).rejects.toMatchObject({
      reason: "NOT_OWNER",
    });
    expect(docCreate).not.toHaveBeenCalled();
  });

  it("creates the document for the owner", async () => {
    subFindUnique.mockResolvedValue({ id: "s1", userId: "u1" });
    docCreate.mockResolvedValue({ id: "d1", type: "THAI_ID", r2Key: "kyc/s1/x" });
    const d = await addDocument("s1", "u1", "THAI_ID", "kyc/s1/x");
    expect(d.id).toBe("d1");
    expect(docCreate).toHaveBeenCalledWith({
      data: { submissionId: "s1", type: "THAI_ID", r2Key: "kyc/s1/x" },
    });
  });
});

describe("finalizeKyc", () => {
  it("throws MISSING_DOCS when a required document type is absent", async () => {
    subFindFirst.mockResolvedValue({
      id: "s1",
      userId: "u1",
      documents: docsOf(["THAI_ID", "SELFIE"]), // missing RIGHT_TO_RENT
    });
    await expect(finalizeKyc("u1", "l1", payout)).rejects.toMatchObject({
      reason: "MISSING_DOCS",
    });
    expect(payoutCreate).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
  });

  it("throws MISSING_PAYOUT when a payout field is blank", async () => {
    subFindFirst.mockResolvedValue({
      id: "s1",
      userId: "u1",
      documents: docsOf([...REQUIRED_DOC_TYPES]),
    });
    await expect(
      finalizeKyc("u1", "l1", { ...payout, accountNumber: "" }),
    ).rejects.toMatchObject({ reason: "MISSING_PAYOUT" });
  });

  it("encrypts the account number (never plaintext) and writes consent", async () => {
    subFindFirst.mockResolvedValue({
      id: "s1",
      userId: "u1",
      documents: docsOf([...REQUIRED_DOC_TYPES, "HOTEL_LICENSE"]),
    });
    payoutFindFirst.mockResolvedValue(null);
    payoutCreate.mockResolvedValue({ id: "p1" });
    consentCreate.mockResolvedValue({ id: "c1" });

    await finalizeKyc("u1", "l1", payout);

    const createArg = payoutCreate.mock.calls[0]?.[0].data;
    expect(createArg.accountNumberEnc).not.toBe(payout.accountNumber);
    expect(createArg.accountNumberEnc).not.toContain(payout.accountNumber);
    expect(decryptField(createArg.accountNumberEnc)).toBe(payout.accountNumber);
    expect(createArg).toMatchObject({ userId: "u1", bankCode: "004", accountName: payout.accountName });

    expect(consentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1", type: "KYC_PROCESSING" }),
      }),
    );
  });

  it("updates an existing payout account instead of creating a second", async () => {
    subFindFirst.mockResolvedValue({
      id: "s1",
      userId: "u1",
      documents: docsOf([...REQUIRED_DOC_TYPES]),
    });
    payoutFindFirst.mockResolvedValue({ id: "p-old" });
    payoutUpdate.mockResolvedValue({ id: "p-old" });
    consentCreate.mockResolvedValue({ id: "c1" });

    await finalizeKyc("u1", "l1", payout);

    expect(payoutCreate).not.toHaveBeenCalled();
    expect(payoutUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p-old" } }),
    );
  });

  it("throws NOT_FOUND when there is no submission for the listing", async () => {
    subFindFirst.mockResolvedValue(null);
    await expect(finalizeKyc("u1", "l1", payout)).rejects.toBeInstanceOf(KycError);
  });
});
