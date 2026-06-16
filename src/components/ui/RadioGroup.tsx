"use client";

import { FieldError } from "./FieldError";

export interface RadioOption {
  value: string;
  label: string;
  /** Optional helper line under the label (e.g. mode explanations). */
  hint?: string;
}

/**
 * RadioGroup — labelled single-choice set rendered as tappable cards (≥44px tap
 * target, DESIGN_SPEC accessibility floor). Selected card carries the aqua ring.
 */
export function RadioGroup({
  label,
  name,
  options,
  value,
  onValueChange,
  error,
  disabled,
}: {
  label: string;
  name: string;
  options: readonly RadioOption[];
  value: string;
  onValueChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-ink-900">{label}</legend>
      <div className="flex flex-col gap-2">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <label
              key={o.value}
              className={`flex cursor-pointer items-start gap-3 rounded-input border px-4 py-3 ${
                selected
                  ? "border-aqua-500 ring-2 ring-aqua-500"
                  : "border-line"
              } bg-sand-100`}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={selected}
                disabled={disabled}
                onChange={() => onValueChange(o.value)}
                className="mt-1 accent-aqua-500"
              />
              <span className="flex flex-col">
                <span className="font-medium text-ink-900">{o.label}</span>
                {o.hint && <span className="text-sm text-ink-700">{o.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <FieldError message={error} />
    </fieldset>
  );
}
