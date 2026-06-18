import { useTranslations } from "next-intl";

/**
 * ReportStatusTrail — the reporter's view of a report's progress (§3.8:
 * รับเรื่อง → กำลังตรวจสอบ → ผลการตัดสิน). Mirrors EscrowStrip's 3-step shape so a
 * report that disappears into a void never happens. DISMISSED reuses the third
 * step with a closed label.
 */
export type ReportStatus = "RECEIVED" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";

const STEP: Record<ReportStatus, 1 | 2 | 3> = {
  RECEIVED: 1,
  IN_REVIEW: 2,
  RESOLVED: 3,
  DISMISSED: 3,
};

function dotClass(state: "done" | "current" | "todo"): string {
  const base = "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold";
  if (state === "done") return `${base} bg-jade-500 text-white`;
  if (state === "current") return `${base} bg-aqua-500 text-ink-900`;
  return `${base} border border-sand-300 text-ink-900/50`;
}

export function ReportStatusTrail({ status }: { status: ReportStatus }) {
  const t = useTranslations("Reports.trail");
  const step = STEP[status];
  const labels = [
    t("received"),
    t("inReview"),
    status === "DISMISSED" ? t("dismissed") : t("resolved"),
  ];

  return (
    <ol className="flex items-start gap-2">
      {labels.map((label, i) => {
        const state = i < step - 1 ? "done" : i === step - 1 ? "current" : "todo";
        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-1 text-center">
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
  );
}
