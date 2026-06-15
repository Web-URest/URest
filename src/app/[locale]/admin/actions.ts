"use server";

import { loginAdmin, logoutAdmin, type LoginResult } from "@/lib/admin/auth";

/**
 * Admin auth server actions. `loginAdmin` sets the admin cookie on success and
 * audits the login; failures are generic (no factor disclosure). Mutating admin
 * actions in other features (#14/#26/#27) must call `requireAdmin` themselves —
 * a layout is not an auth boundary.
 */

export async function loginAction(
  email: string,
  password: string,
  token: string,
): Promise<LoginResult> {
  return loginAdmin(email, password, token);
}

export async function logoutAction(): Promise<void> {
  await logoutAdmin();
}
