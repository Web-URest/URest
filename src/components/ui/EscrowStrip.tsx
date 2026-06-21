import { useTranslations } from "next-intl";
import { TileStrip } from "./TileStrip";

/**
 * EscrowStrip — the brand component (DESIGN_SPEC §3 motif #3). A 3-step tracker that
 * makes "where is my money" answerable at a glance:
 *   guest:  You pay → U-Rest holds it → Host paid after checkout
 *   host:   Guest paid → U-Rest holds it → Paid to you after checkout
 * Appears on checkout, payment, trip detail, host payout screens, and (compact) the
 * listing page. `step` is the current (active) step, 1–3.
 */
type Audience = "guest" | "host";
type Variant = "full" | "compact";

function dotClass(state: "done" | "current" | "todo"): string {
  const base =
    "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold";
  if (state === "done") return `${base} bg-jade-500 text-white`;
  if (state === "current") return `${base} bg-aqua-500 text-white`;
  return `${base} border border-sand-300 text-ink-900/50`;
}

export function EscrowStrip({
  step,
  audience = "guest",
  variant = "full",
}: {
  step: 1 | 2 | 3;
  audience?: Audience;
  variant?: Variant;
}) {
  const t = useTranslations("Escrow");
  const labels =
    audience === "host"
      ? [t("hostStep1"), t("hostStep2"), t("hostStep3")]
      : [t("guestStep1"), t("guestStep2"), t("guestStep3")];

  if (variant === "compact") {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-ink-700">
        <span className="inline-flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full ${i <= step - 1 ? "bg-aqua-500" : "bg-sand-300"}`}
            />
          ))}
        </span>
        <span className="font-medium text-ink-900">{labels[step - 1] ?? ""}</span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card bg-white shadow-card">
      <TileStrip />
      <ol className="flex items-start gap-2 p-4">
        {labels.map((label, i) => {
          const state = i < step - 1 ? "done" : i === step - 1 ? "current" : "todo";
          return (
            <li
              key={label}
              className="flex flex-1 flex-col items-center gap-2 text-center"
            >
              <span className={dotClass(state)}>{state === "done" ? "✓" : i + 1}</span>
              <span
                className={`text-xs ${state === "todo" ? "text-ink-900/50" : "text-ink-900"} ${
                  state === "current" ? "font-semibold" : ""
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
