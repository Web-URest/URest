"use client";

import type { ReactNode } from "react";

import { FieldError } from "./FieldError";

/**
 * Checkbox — labelled boolean. Used for the amenity grid and the instant-mode
 * strike acknowledgment (PRODUCT_FLOWS §4.1). Label may be a node so callers can
 * embed emphasis or warning copy.
 */
export function Checkbox({
  label,
  checked,
  onCheckedChange,
  error,
  disabled,
  id,
}: {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string | null;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex cursor-pointer items-start gap-3" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="mt-1 h-4 w-4 accent-aqua-500"
        />
        <span className="text-ink-900">{label}</span>
      </label>
      <FieldError message={error} />
    </div>
  );
}
