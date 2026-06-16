/**
 * WizardStepper — horizontal step progress for the listing wizard
 * (PRODUCT_FLOWS §4.1). Presentational: shows which step is current, which are
 * done. Step labels are passed already-translated. Past steps are tappable so a
 * host can jump back to edit a saved step.
 */
export interface WizardStep {
  label: string;
}

export function WizardStepper({
  steps,
  current,
  onStepSelect,
}: {
  steps: readonly WizardStep[];
  /** 1-based current step. */
  current: number;
  /** Called with a 1-based step number when a completed step is tapped. */
  onStepSelect?: (step: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((step, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        const reachable = done && onStepSelect;
        const dot = active
          ? "bg-aqua-500 text-ink-900"
          : done
            ? "bg-jade-500 text-white"
            : "bg-sand-300 text-ink-700";
        return (
          <li key={step.label} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onStepSelect(n)}
              className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm ${
                reachable ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${dot}`}
              >
                {done ? "✓" : n}
              </span>
              <span
                className={active ? "font-semibold text-ink-900" : "text-ink-700"}
              >
                {step.label}
              </span>
            </button>
            {n < steps.length && <span className="text-sand-300">—</span>}
          </li>
        );
      })}
    </ol>
  );
}
