/**
 * SlaBadge — operational queue urgency (v3). A THIRD pill family, deliberately NOT
 * StatusPill (which is reserved for the two domain families: booking state vs payout
 * state). Used by host requests + admin queues for SLA / money-at-risk / appeal flags.
 * Text always carries the meaning; color is secondary (a11y).
 */
type Variant = "urgent" | "warning" | "info";

const VARIANTS: Record<Variant, string> = {
  urgent: "bg-error-50 text-error-600",
  warning: "bg-pending-50 text-pending-700",
  info: "bg-surface-50 text-ink-700",
};

export function SlaBadge({
  label,
  variant = "info",
  className = "",
}: {
  label: string;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${VARIANTS[variant]} ${className}`}
    >
      {label}
    </span>
  );
}
