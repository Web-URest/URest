import type { ReactNode } from "react";

/**
 * TrustBadge — small "verified / escrow-safe" badge (v3, green = trust). The badge is
 * ALWAYS green: trust is the product. Consumer passes the (translated) label.
 */
export function TrustBadge({
  label,
  icon,
  className = "",
}: {
  label: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-trust-50 px-2.5 py-1 text-xs font-semibold text-trust-700 ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}
