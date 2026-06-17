"use server";

import { AuthError, requireUser } from "@/lib/auth/guards";
import { saveVilla, unsaveVilla } from "@/lib/savedVilla";

export type SaveToggleResult =
  | { ok: true; saved: boolean }
  | { ok: false; error: "UNAUTHENTICATED" | "errorGeneric" };

export async function toggleSaveAction(
  listingId: string,
  saving: boolean,
): Promise<SaveToggleResult> {
  try {
    const user = await requireUser();
    if (saving) {
      await saveVilla(user.id, listingId);
    } else {
      await unsaveVilla(user.id, listingId);
    }
    return { ok: true, saved: saving };
  } catch (e) {
    if (e instanceof AuthError) {
      // UNAUTHENTICATED or SUSPENDED — redirect client to sign-in
      return { ok: false, error: "UNAUTHENTICATED" };
    }
    return { ok: false, error: "errorGeneric" };
  }
}
