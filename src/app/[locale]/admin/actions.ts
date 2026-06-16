"use server";

import { loginAdmin, logoutAdmin, type LoginResult } from "@/lib/admin/auth";
import { redirect } from "@/i18n/navigation";

/**
 * Admin auth server actions. On success they redirect **server-side** so the
 * navigation rides the same response that sets/clears the cookie — avoiding the
 * RSC-cache race a client `router.push` after a cookie write can hit. The login
 * failure path still returns `{ ok: false }` so the form can show the generic
 * (factor-agnostic) error. Mutating admin actions in other features
 * (#14/#26/#27) must call `requireAdmin` themselves — a layout is not a boundary.
 */

export async function loginAction(
  locale: string,
  email: string,
  password: string,
  token: string,
): Promise<LoginResult> {
  const result = await loginAdmin(email, password, token);
  if (result.ok) redirect({ href: "/admin", locale }); // throws NEXT_REDIRECT
  return result;
}

export async function logoutAction(locale: string): Promise<void> {
  await logoutAdmin();
  redirect({ href: "/admin/login", locale });
}
