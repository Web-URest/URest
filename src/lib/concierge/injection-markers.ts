/**
 * Off-platform payment markers (AI_CONCIERGE_SPEC §4 rule 6). Pure + dependency-
 * free so both the tool layer (tools.ts) and the eval grader (eval-grader.ts) can
 * use it without pulling the auth/Prisma chain. Presence in host content means the
 * model must not relay it and should flag the listing.
 */
export const OFF_PLATFORM_PAYMENT_RE = /เลขบัญชี|โอนตรง/;

export function hasOffPlatformPayment(text: string): boolean {
  return OFF_PLATFORM_PAYMENT_RE.test(text);
}
