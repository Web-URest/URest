"use server";

import { Prisma } from "@prisma/client";

import { deleteAccount } from "@/lib/account";
import { signOut } from "@/lib/auth/auth";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { normalizePrefs } from "@/lib/notifications/prefs";

export type ActionResult = { ok: boolean };

/** Persist the notification-preference matrix (§3.7). normalizePrefs forces essential email on. */
export async function saveNotifPrefsAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { notificationPrefs: normalizePrefs(input) as Prisma.InputJsonValue },
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Delete the account (hard-delete or anonymize, per lib/account) then sign the user
 * out. On success `signOut` redirects (throws NEXT_REDIRECT) so this never returns ok;
 * it only returns `{ ok: false }` when something failed before the redirect.
 */
export async function deleteAccountAction(): Promise<ActionResult> {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return { ok: false };
  }
  try {
    await deleteAccount(userId);
  } catch {
    return { ok: false };
  }
  await signOut({ redirectTo: "/" }); // clears the cookie + redirects (control-flow throw)
  return { ok: false };
}
