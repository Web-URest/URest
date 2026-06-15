import { prisma } from "@/lib/db";

import { auth } from "./auth";

/**
 * Server-side verification-ladder enforcement (ADR-007).
 *
 * The ladder is enforced HERE — in server actions / route handlers — not in
 * middleware (database sessions can't be validated at the edge). Each guard
 * re-reads the `User` row so a suspend/ban (`suspendedAt`/`deletedAt`) takes
 * effect immediately, even before the session-delete sweep runs (ADR-010).
 */

export type AuthErrorReason =
  | "UNAUTHENTICATED"
  | "SUSPENDED"
  | "PHONE_UNVERIFIED";

export class AuthError extends Error {
  constructor(public readonly reason: AuthErrorReason) {
    super(reason);
    this.name = "AuthError";
  }
}

export type GuardedUser = {
  id: string;
  lineUserId: string | null;
  phoneVerifiedAt: Date | null;
  displayName: string;
};

/** Ladder step 1 (signup → browse/save/AI-chat). */
export async function requireUser(): Promise<GuardedUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthError("UNAUTHENTICATED");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user || user.suspendedAt || user.deletedAt) {
    throw new AuthError("SUSPENDED");
  }

  return {
    id: user.id,
    lineUserId: user.lineUserId,
    phoneVerifiedAt: user.phoneVerifiedAt,
    displayName: user.displayName,
  };
}

/** Ladder step 2 (phone OTP → send booking requests & messages). */
export async function requirePhoneVerified(): Promise<GuardedUser> {
  const user = await requireUser();
  if (!user.phoneVerifiedAt) {
    throw new AuthError("PHONE_UNVERIFIED");
  }
  return user;
}
