"use client";

import { useEffect, useState } from "react";

/**
 * CountdownChip — live countdown to a deadline (v3). Urgent (under threshold) renders
 * red; otherwise neutral. Per a11y (DESIGN_SPEC §7) the absolute time is always in the
 * `title`. Consumers pass translated `prefix` / `expiredLabel`. Used on pay, trips, host
 * requests. Money urgency is RED (not brand rose).
 */
function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function CountdownChip({
  deadlineIso,
  prefix,
  expiredLabel,
  urgentThresholdMs = 3_600_000,
  className = "",
}: {
  deadlineIso: string;
  prefix?: string;
  expiredLabel: string;
  urgentThresholdMs?: number;
  className?: string;
}) {
  const deadline = new Date(deadlineIso).getTime();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = deadline - now;
  const expired = remaining <= 0;
  const urgent = !expired && remaining <= urgentThresholdMs;
  const abs = new Date(deadline).toLocaleString();

  return (
    <span
      title={abs}
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-semibold tabular-nums ${
        expired || urgent
          ? "bg-error-50 text-error-600"
          : "bg-surface-50 text-ink-700"
      } ${className}`}
    >
      {expired ? expiredLabel : `${prefix ? prefix + " " : ""}${fmt(remaining)}`}
    </span>
  );
}
