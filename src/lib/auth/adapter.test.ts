import { describe, expect, it, vi } from "vitest";
import type { AdapterUser } from "@auth/core/adapters";
import type { PrismaClient } from "@prisma/client";

import { CustomPrismaAdapter, toAdapterUser } from "./adapter";

/** Minimal prisma test double — only the methods our adapter overrides. */
function mockPrisma() {
  return {
    user: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    account: { findUnique: vi.fn() },
    session: { findUnique: vi.fn() },
  };
}

const row = {
  id: "u1",
  displayName: "สมชาย",
  email: "som@example.com",
  image: "https://img/1.png",
  lineUserId: "Uline123",
  phoneVerifiedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("toAdapterUser", () => {
  it("maps displayName→name and always emits emailVerified:null", () => {
    const u = toAdapterUser(row);
    expect(u.name).toBe("สมชาย");
    expect(u.emailVerified).toBeNull();
    expect(u.lineUserId).toBe("Uline123");
    expect(u.phoneVerifiedAt).toEqual(row.phoneVerifiedAt);
  });

  it("coerces a null email to an empty string (AdapterUser.email is required)", () => {
    expect(toAdapterUser({ ...row, email: null }).email).toBe("");
  });
});

describe("CustomPrismaAdapter.createUser", () => {
  it("writes displayName + lineUserId, never name/emailVerified", async () => {
    const prisma = mockPrisma();
    prisma.user.create.mockResolvedValue(row);
    const adapter = CustomPrismaAdapter(prisma as unknown as PrismaClient);

    const input = {
      id: "ignored",
      name: "สมชาย",
      email: "som@example.com",
      emailVerified: null,
      image: "https://img/1.png",
      lineUserId: "Uline123",
      phoneVerifiedAt: null,
    } satisfies AdapterUser;

    const result = await adapter.createUser!(input);

    const data = prisma.user.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      displayName: "สมชาย",
      email: "som@example.com",
      lineUserId: "Uline123",
    });
    expect(data).not.toHaveProperty("name");
    expect(data).not.toHaveProperty("emailVerified");
    expect(result.name).toBe("สมชาย");
  });

  it("falls back to 'LINE user' when name is missing", async () => {
    const prisma = mockPrisma();
    prisma.user.create.mockResolvedValue({ ...row, displayName: "LINE user" });
    const adapter = CustomPrismaAdapter(prisma as unknown as PrismaClient);

    await adapter.createUser!({
      id: "x",
      name: null,
      email: "",
      emailVerified: null,
      lineUserId: "Uline999",
    } as AdapterUser);

    expect(prisma.user.create.mock.calls[0]![0].data.displayName).toBe(
      "LINE user",
    );
  });
});

describe("CustomPrismaAdapter.updateUser", () => {
  it("maps name→displayName and drops emailVerified", async () => {
    const prisma = mockPrisma();
    prisma.user.update.mockResolvedValue(row);
    const adapter = CustomPrismaAdapter(prisma as unknown as PrismaClient);

    await adapter.updateUser!({
      id: "u1",
      name: "ใหม่",
      emailVerified: new Date(),
    });

    const data = prisma.user.update.mock.calls[0]![0].data;
    expect(data).toMatchObject({ displayName: "ใหม่" });
    expect(data).not.toHaveProperty("emailVerified");
  });
});

describe("CustomPrismaAdapter.getSessionAndUser", () => {
  it("returns mapped user + plain session row", async () => {
    const prisma = mockPrisma();
    const expires = new Date("2026-02-01T00:00:00Z");
    prisma.session.findUnique.mockResolvedValue({
      sessionToken: "tok",
      userId: "u1",
      expires,
      user: row,
    });
    const adapter = CustomPrismaAdapter(prisma as unknown as PrismaClient);

    const out = await adapter.getSessionAndUser!("tok");
    expect(out).not.toBeNull();
    expect(out!.session).toEqual({
      sessionToken: "tok",
      userId: "u1",
      expires,
    });
    expect(out!.user.name).toBe("สมชาย");
  });

  it("returns null when the session is absent", async () => {
    const prisma = mockPrisma();
    prisma.session.findUnique.mockResolvedValue(null);
    const adapter = CustomPrismaAdapter(prisma as unknown as PrismaClient);
    expect(await adapter.getSessionAndUser!("nope")).toBeNull();
  });
});
