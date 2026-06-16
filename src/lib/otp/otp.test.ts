import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { hashOtp } from "@/lib/crypto";

vi.mock("@/lib/db", () => ({
  prisma: {
    phoneOtp: {
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const send = vi.fn();
vi.mock("./sms", () => ({ getSmsDriver: () => ({ send }) }));

import { prisma } from "@/lib/db";
import {
  MAX_ATTEMPTS,
  normalizeThaiMobile,
  purgeDeadOtps,
  requestPhoneOtp,
  verifyPhoneOtp,
} from "./otp";

const deleteMany = prisma.phoneOtp.deleteMany as unknown as Mock;
const findFirst = prisma.phoneOtp.findFirst as unknown as Mock;
const create = prisma.phoneOtp.create as unknown as Mock;
const otpUpdate = prisma.phoneOtp.update as unknown as Mock;
const userUpdate = prisma.user.update as unknown as Mock;
const tx = prisma.$transaction as unknown as Mock;

beforeEach(() => {
  // Defaults: no prior rows, transaction runs its array of ops.
  deleteMany.mockResolvedValue({ count: 0 });
  findFirst.mockResolvedValue(null);
  create.mockResolvedValue({ id: "otp1" });
  tx.mockImplementation(async (ops: unknown[]) => ops);
});
afterEach(() => vi.clearAllMocks());

function otpRow(over: Record<string, unknown> = {}) {
  return {
    id: "otp1",
    userId: "u1",
    phone: "0812345678",
    codeHash: hashOtp("123456"),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    consumedAt: null,
    createdAt: new Date(Date.now() - 5 * 60_000),
    ...over,
  };
}

describe("normalizeThaiMobile", () => {
  it("accepts a plain 10-digit mobile", () => {
    expect(normalizeThaiMobile("0812345678")).toBe("0812345678");
  });
  it("strips spaces and dashes", () => {
    expect(normalizeThaiMobile("081-234 5678")).toBe("0812345678");
  });
  it("converts +66 / 66 international form to local 0-prefixed", () => {
    expect(normalizeThaiMobile("+66812345678")).toBe("0812345678");
    expect(normalizeThaiMobile("66812345678")).toBe("0812345678");
  });
  it("rejects non-mobile prefixes (landline 02…)", () => {
    expect(normalizeThaiMobile("021234567")).toBeNull();
  });
  it("rejects wrong length", () => {
    expect(normalizeThaiMobile("08123")).toBeNull();
  });
});

describe("requestPhoneOtp", () => {
  it("rejects an invalid phone without touching the DB", async () => {
    const result = await requestPhoneOtp("u1", "not-a-phone");
    expect(result.status).toBe("INVALID_PHONE");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a hashed code, sends it, and never returns the code", async () => {
    const result = await requestPhoneOtp("u1", "081-234-5678");
    expect(result.status).toBe("SENT");
    expect(result).not.toHaveProperty("code");

    const createArg = create.mock.calls[0]?.[0]?.data;
    expect(createArg.userId).toBe("u1");
    expect(createArg.phone).toBe("0812345678");
    expect(createArg.attempts).toBe(0);
    expect(typeof createArg.codeHash).toBe("string");
    // Plaintext code must not be stored.
    expect(createArg).not.toHaveProperty("code");
    expect(createArg.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Delivered to the normalized number, code only inside the message.
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("0812345678");
    expect(send.mock.calls[0]?.[1]).toMatch(/\d{6}/);
  });

  it("purges the user's dead rows before issuing a new code", async () => {
    await requestPhoneOtp("u1", "0812345678");
    expect(deleteMany).toHaveBeenCalled();
    expect(deleteMany.mock.calls[0]?.[0]?.where?.userId).toBe("u1");
  });

  it("rate-limits a rapid re-request (cooldown)", async () => {
    findFirst.mockResolvedValue(otpRow({ createdAt: new Date() }));
    const result = await requestPhoneOtp("u1", "0812345678");
    expect(result.status).toBe("RATE_LIMITED");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("verifyPhoneOtp", () => {
  it("returns NO_ACTIVE_CODE when there is no unconsumed row", async () => {
    findFirst.mockResolvedValue(null);
    expect((await verifyPhoneOtp("u1", "123456")).status).toBe("NO_ACTIVE_CODE");
  });

  it("returns EXPIRED for a lapsed code", async () => {
    findFirst.mockResolvedValue(otpRow({ expiresAt: new Date(Date.now() - 1) }));
    expect((await verifyPhoneOtp("u1", "123456")).status).toBe("EXPIRED");
  });

  it("verifies the correct code: marks phone verified and consumes the row atomically", async () => {
    findFirst.mockResolvedValue(otpRow());
    otpUpdate.mockResolvedValue({ attempts: 1 }); // atomic increment result
    const result = await verifyPhoneOtp("u1", "123456");
    expect(result.status).toBe("VERIFIED");

    // Attempt count incremented atomically (not read-modify-write).
    expect(otpUpdate.mock.calls[0]?.[0]?.data?.attempts).toEqual({ increment: 1 });
    // Success runs consume + user-verify in one transaction.
    expect(tx).toHaveBeenCalledOnce();
    expect(userUpdate.mock.calls[0]?.[0]?.data?.phoneVerifiedAt).toBeInstanceOf(Date);
    expect(userUpdate.mock.calls[0]?.[0]?.data?.phone).toBe("0812345678");
  });

  it("rejects a wrong code and reports remaining attempts", async () => {
    findFirst.mockResolvedValue(otpRow());
    otpUpdate.mockResolvedValue({ attempts: 1 });
    const result = await verifyPhoneOtp("u1", "000000");
    expect(result.status).toBe("INVALID_CODE");
    if (result.status === "INVALID_CODE") {
      expect(result.attemptsRemaining).toBe(MAX_ATTEMPTS - 1);
    }
    // No user mutation on a wrong code.
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("locks out after the final wrong attempt and consumes the row", async () => {
    findFirst.mockResolvedValue(otpRow({ attempts: MAX_ATTEMPTS - 1 }));
    otpUpdate.mockResolvedValueOnce({ attempts: MAX_ATTEMPTS }); // increment result
    const result = await verifyPhoneOtp("u1", "000000");
    expect(result.status).toBe("TOO_MANY_ATTEMPTS");
    // Row consumed so it can't be retried.
    const consumeCall = otpUpdate.mock.calls.find(
      (c) => c[0]?.data?.consumedAt instanceof Date,
    );
    expect(consumeCall).toBeTruthy();
  });
});

describe("purgeDeadOtps", () => {
  it("deletes expired and consumed rows and returns the count", async () => {
    deleteMany.mockResolvedValue({ count: 7 });
    expect(await purgeDeadOtps()).toBe(7);
    const where = deleteMany.mock.calls[0]?.[0]?.where;
    expect(where.OR).toBeTruthy();
  });
});
