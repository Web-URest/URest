/**
 * Notification-preference taxonomy + the send-path gate (#35, PRODUCT_FLOWS §3.7).
 * Pure module — no Prisma, no I/O — so `notify()` and the retry sweep both import it.
 *
 * Policy: a per-group × per-channel matrix stored on `User.notificationPrefs` (JSON).
 * ESSENTIAL groups are transactional/money notices — their EMAIL channel is locked on
 * (a guest can never miss a refund/cancellation), only their LINE push is toggleable.
 * OPTIONAL groups are fully toggleable. Absent/null prefs default to ON (opt-out).
 */
import { NotificationChannel } from "@prisma/client";

export type NotifGroup =
  | "BOOKING"
  | "PAYMENTS"
  | "LISTING"
  | "MESSAGES"
  | "REVIEWS_REPORTS"
  | "MARKETING";

/** Per-channel on/off for one group. Absent channel = default on. */
export type NotifPrefs = Partial<Record<NotifGroup, { email?: boolean; line?: boolean }>>;

export const ALL_GROUPS: readonly NotifGroup[] = [
  "BOOKING",
  "PAYMENTS",
  "LISTING",
  "MESSAGES",
  "REVIEWS_REPORTS",
  "MARKETING",
];

/** Transactional groups: their EMAIL is the channel of record and cannot be disabled. */
export const ESSENTIAL_GROUPS: ReadonlySet<NotifGroup> = new Set<NotifGroup>([
  "BOOKING",
  "PAYMENTS",
  "LISTING",
]);

/** Groups a user can actually toggle in the UI (MARKETING is reserved — no templates yet). */
export const TOGGLEABLE_GROUPS: readonly NotifGroup[] = [
  "BOOKING",
  "PAYMENTS",
  "LISTING",
  "MESSAGES",
  "REVIEWS_REPORTS",
];

/** Every notification template key → its event group (templates.ts is the registry). */
export const GROUP_OF: Record<string, NotifGroup> = {
  // BOOKING lifecycle (essential)
  BOOKING_REQUESTED: "BOOKING",
  REQUEST_ACCEPTED: "BOOKING",
  REQUEST_DECLINED: "BOOKING",
  REQUEST_EXPIRED: "BOOKING",
  BOOKING_CANCELLED_BY_GUEST: "BOOKING",
  BOOKING_CANCELLED_BY_HOST: "BOOKING",
  // Payments + payouts (essential)
  PAYMENT_RECEIVED_GUEST: "PAYMENTS",
  PAYMENT_RECEIVED_HOST: "PAYMENTS",
  PAYMENT_REMINDER_GUEST: "PAYMENTS",
  PAYMENT_REFUNDED_GUEST: "PAYMENTS",
  PAYMENT_EXPIRED_HOST: "PAYMENTS",
  PAYOUT_PAID_HOST: "PAYMENTS",
  PAYOUT_HOLD_CREATED: "PAYMENTS",
  PAYOUT_HOLD_RELEASED: "PAYMENTS",
  // Listing approval (essential — host KYC/approval)
  LISTING_APPROVED: "LISTING",
  LISTING_NEEDS_INFO: "LISTING",
  LISTING_REJECTED: "LISTING",
  // Messaging (optional)
  MESSAGE_NEW: "MESSAGES",
  // Reviews + reports (optional)
  REVIEW_RECEIVED_HOST: "REVIEWS_REPORTS",
  REPORT_RECEIVED: "REVIEWS_REPORTS",
  REPORT_RESOLVED: "REVIEWS_REPORTS",
  REPORT_DISMISSED: "REVIEWS_REPORTS",
};

/**
 * Should `templateKey` be delivered on `channel` for a user with these prefs?
 * Unknown keys are never suppressed; essential EMAIL is always allowed; otherwise
 * a channel sends unless the stored pref explicitly set it to `false`.
 */
export function channelAllowed(
  prefs: NotifPrefs | null | undefined,
  templateKey: string,
  channel: NotificationChannel,
): boolean {
  const group = GROUP_OF[templateKey];
  if (!group) return true; // unknown template → don't suppress
  if (channel === NotificationChannel.EMAIL && ESSENTIAL_GROUPS.has(group)) return true;

  const groupPref = prefs?.[group];
  if (!groupPref) return true; // no stored pref → default on
  const value = channel === NotificationChannel.EMAIL ? groupPref.email : groupPref.line;
  return value !== false; // on unless explicitly disabled
}

/**
 * Validate + whitelist incoming prefs (e.g. from the settings form) before storing.
 * Drops unknown groups, coerces each channel to a boolean (default on), and forces
 * essential-group EMAIL to true so the locked channel can't be disabled via the API.
 */
export function normalizePrefs(input: unknown): NotifPrefs {
  if (typeof input !== "object" || input === null) return {};
  const raw = input as Record<string, unknown>;
  const out: NotifPrefs = {};
  for (const group of ALL_GROUPS) {
    const cell = raw[group];
    if (typeof cell !== "object" || cell === null) continue;
    const c = cell as Record<string, unknown>;
    const email = ESSENTIAL_GROUPS.has(group) ? true : c.email !== false;
    const line = c.line !== false;
    out[group] = { email, line };
  }
  return out;
}
