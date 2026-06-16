import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/crypto", () => ({ decryptField: vi.fn(() => "DECRYPTEDSECRET") }));
vi.mock("./password", () => ({ verifyPassword: vi.fn() }));
vi.mock("./totp", () => ({ verifyTotp: vi.fn() }));

import { prisma } from "@/lib/db";
import { verifyPassword } from "./password";
import { verifyTotp } from "./totp";
import {
  ADMIN_COOKIE,
  AdminAuthError,
  getAdmin,
  loginAdmin,
  logoutAdmin,
  requireAdmin,
} from "./auth";
import { signAdminSession } from "./session";

const findUnique = prisma.adminUser.findUnique as unknown as Mock;
const auditCreate = prisma.auditLog.create as unknown as Mock;
const mockVerifyPassword = verifyPassword as unknown as Mock;
const mockVerifyTotp = verifyTotp as unknown as Mock;

function admin(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    email: "admin@urest.local",
    passwordHash: "$argon2id$stored",
    totpSecretEnc: "v1.k1.iv.ct.tag",
    displayName: "ทีมงาน",
    disabledAt: null,
    ...over,
  };
}

beforeEach(() => {
  mockVerifyPassword.mockResolvedValue(true);
  mockVerifyTotp.mockReturnValue(true);
  findUnique.mockResolvedValue(admin());
  auditCreate.mockResolvedValue({});
});
afterEach(() => vi.clearAllMocks());

describe("loginAdmin", () => {
  it("succeeds with correct password + TOTP, audits the login, sets the admin cookie", async () => {
    const result = await loginAdmin("admin@urest.local", "pw", "123456");
    expect(result.ok).toBe(true);

    // Successful login is audited (acceptance: admin logins write AuditLog).
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(auditCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      adminId: "a1",
      action: "ADMIN_LOGIN",
    });

    // Cookie is the dedicated admin cookie, httpOnly, site-wide path.
    const [name, , opts] = cookieStore.set.mock.calls[0] ?? [];
    expect(name).toBe(ADMIN_COOKIE);
    expect(opts).toMatchObject({ httpOnly: true, path: "/", sameSite: "strict" });
  });

  it("fails (generically) for an unknown email — no cookie, no audit", async () => {
    findUnique.mockResolvedValue(null);
    expect((await loginAdmin("nobody@x", "pw", "123456")).ok).toBe(false);
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("fails for a disabled admin", async () => {
    findUnique.mockResolvedValue(admin({ disabledAt: new Date() }));
    expect((await loginAdmin("admin@urest.local", "pw", "123456")).ok).toBe(false);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("fails on a wrong password", async () => {
    mockVerifyPassword.mockResolvedValue(false);
    expect((await loginAdmin("admin@urest.local", "bad", "123456")).ok).toBe(false);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("fails on a wrong TOTP token", async () => {
    mockVerifyTotp.mockReturnValue(false);
    expect((await loginAdmin("admin@urest.local", "pw", "000000")).ok).toBe(false);
    expect(auditCreate).not.toHaveBeenCalled();
  });
});

describe("getAdmin / requireAdmin", () => {
  it("returns null with no admin cookie", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await getAdmin()).toBeNull();
  });

  it("returns null for an invalid/forged token (consumer session is useless here)", async () => {
    cookieStore.get.mockReturnValue({ value: "garbage.token" });
    expect(await getAdmin()).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns the principal for a valid token + live admin", async () => {
    cookieStore.get.mockReturnValue({ value: signAdminSession("a1") });
    expect(await getAdmin()).toMatchObject({ id: "a1", email: "admin@urest.local" });
  });

  it("returns null when the admin was disabled after the token was issued", async () => {
    cookieStore.get.mockReturnValue({ value: signAdminSession("a1") });
    findUnique.mockResolvedValue(admin({ disabledAt: new Date() }));
    expect(await getAdmin()).toBeNull();
  });

  it("requireAdmin throws AdminAuthError when unauthenticated", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminAuthError);
  });
});

describe("logoutAdmin", () => {
  it("clears the admin cookie", async () => {
    await logoutAdmin();
    expect(cookieStore.delete).toHaveBeenCalledWith(ADMIN_COOKIE);
  });
});
