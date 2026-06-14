import { useTranslations } from "next-intl";

/**
 * StatusPill — the one true renderer for booking & payout states (DESIGN_SPEC §3,
 * PRODUCT_FLOWS §2.1/§3.3). Every state has a defined pill; never render a state as
 * plain text. Two pill families share this component:
 *   - booking states (what happened to the booking)
 *   - payout states  (where the money is) — REVERSED surfaces as the guest-facing "Refunded"
 * Labels come from the shared `Status.*` i18n namespace; styles use @theme tokens only.
 */
export type BookingStatus =
  | "REQUESTED"
  | "AWAITING_PAYMENT"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "DISPUTED"
  | "COMPLETED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED_BY_GUEST"
  | "CANCELLED_BY_HOST";

export type PayoutStatus = "HELD" | "RELEASABLE" | "PAID" | "FROZEN" | "REVERSED";

export type PillStatus = BookingStatus | PayoutStatus;

const STYLES: Record<PillStatus, string> = {
  // Booking states
  REQUESTED: "bg-sand-100 text-ink-900",
  AWAITING_PAYMENT: "bg-coral-500 text-white",
  CONFIRMED: "bg-aqua-100 text-teal-600",
  CHECKED_IN: "bg-aqua-500 text-ink-900",
  DISPUTED: "bg-gold-100 text-gold-800",
  COMPLETED: "bg-jade-100 text-jade-500",
  DECLINED: "bg-sand-300 text-ink-900/60",
  EXPIRED: "bg-sand-300 text-ink-900/60",
  CANCELLED_BY_GUEST: "bg-coral-100 text-coral-600",
  CANCELLED_BY_HOST: "bg-coral-100 text-coral-600",
  // Payout / money states
  HELD: "bg-aqua-100 text-teal-600",
  RELEASABLE: "bg-aqua-100 text-teal-600",
  PAID: "bg-jade-100 text-jade-500",
  FROZEN: "bg-coral-100 text-coral-600",
  REVERSED: "bg-coral-100 text-coral-600",
};

/** Glyph prefixes for attention states (text still carries the meaning — never color alone). */
const MARKER: Partial<Record<PillStatus, string>> = {
  DISPUTED: "⚠",
  FROZEN: "🔒",
};

export function StatusPill({ status }: { status: PillStatus }) {
  const t = useTranslations("Status");
  const marker = MARKER[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${STYLES[status]}`}
    >
      {marker ? <span aria-hidden>{marker}</span> : null}
      {t(status)}
    </span>
  );
}
