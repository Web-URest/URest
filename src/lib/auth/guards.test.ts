import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("./auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { auth } from "./auth";
import { prisma } from "@/lib/db";

import { AuthError, requirePhoneVerified, requireUser } from "./guards";

// `auth` is an overloaded value (also a middleware wrapper) and `User` is a
// type-only Prisma export — cast the mocks to plain Mocks so we can stub
// resolved values without fighting those signatures.
const mockAuth = auth as unknown as Mock;
const mockFindUnique = prisma.user.findUnique as unknown as Mock;

function session(id: string | null) {
  return id ? { user: { id } } : null;
}

function userRow(over: Record<string, unknown>) {
  return {
    id: "u1",
    displayName: "สมชาย",
    lineUserId: "Uline123",
    phoneVerifiedAt: null,
    suspendedAt: null,
    deletedAt: null,
    ...over,
  };
}

afterEach(() => vi.clearAllMocks());

describe("requireUser", () => {
  it("throws UNAUTHENTICATED with no session", async () => {
    mockAuth.mockResolvedValue(session(null));
    await expect(requireUser()).rejects.toMatchObject({
      reason: "UNAUTHENTICATED",
    });
  });

  it("throws SUSPENDED when the user row is gone", async () => {
    mockAuth.mockResolvedValue(session("u1"));
    mockFindUnique.mockResolvedValue(null);
    await expect(requireUser()).rejects.toBeInstanceOf(AuthError);
  });

  it("throws SUSPENDED when suspendedAt is set", async () => {
    mockAuth.mockResolvedValue(session("u1"));
    mockFindUnique.mockResolvedValue(userRow({ suspendedAt: new Date() }));
    await expect(requireUser()).rejects.toMatchObject({ reason: "SUSPENDED" });
  });

  it("throws SUSPENDED when deletedAt is set", async () => {
    mockAuth.mockResolvedValue(session("u1"));
    mockFindUnique.mockResolvedValue(userRow({ deletedAt: new Date() }));
    await expect(requireUser()).rejects.toMatchObject({ reason: "SUSPENDED" });
  });

  it("returns the guarded user when live", async () => {
    mockAuth.mockResolvedValue(session("u1"));
    mockFindUnique.mockResolvedValue(userRow({}));
    await expect(requireUser()).resolves.toMatchObject({
      id: "u1",
      displayName: "สมชาย",
    });
  });
});

describe("requirePhoneVerified", () => {
  it("throws PHONE_UNVERIFIED when phoneVerifiedAt is null", async () => {
    mockAuth.mockResolvedValue(session("u1"));
    mockFindUnique.mockResolvedValue(userRow({ phoneVerifiedAt: null }));
    await expect(requirePhoneVerified()).rejects.toMatchObject({
      reason: "PHONE_UNVERIFIED",
    });
  });

  it("passes when phoneVerifiedAt is set", async () => {
    mockAuth.mockResolvedValue(session("u1"));
    mockFindUnique.mockResolvedValue(userRow({ phoneVerifiedAt: new Date() }));
    await expect(requirePhoneVerified()).resolves.toMatchObject({ id: "u1" });
  });
});
