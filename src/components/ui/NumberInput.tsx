"use client";

import type { InputHTMLAttributes } from "react";

import { FieldError } from "./FieldError";

/**
 * NumberInput — labelled numeric field with an optional unit affix (฿, เมตร, …).
 * Emits the parsed number (or null when empty) via `onValueChange`, so callers
 * never parse strings themselves. Money is entered in BAHT here and converted to
 * integer satang at the edge by the caller (`satangFromBaht`) — this primitive
 * stays unit-agnostic.
 */
export function NumberInput({
  label,
  error,
  id,
  prefix,
  suffix,
  value,
  onValueChange,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  label: string;
  error?: string | null;
  prefix?: string;
  suffix?: string;
  value: number | null;
  onValueChange: (value: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-2" htmlFor={id}>
      <span className="text-sm font-medium text-ink-900">{label}</span>
      <div className="flex items-center gap-2 rounded-input border border-line bg-sand-100 px-4 py-3 focus-within:ring-2 focus-within:ring-aqua-500">
        {prefix && <span className="text-ink-700">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            onValueChange(raw === "" ? null : Number(raw));
          }}
          className={`w-full bg-transparent text-ink-900 outline-none disabled:opacity-50 ${className}`}
          {...props}
        />
        {suffix && <span className="text-ink-700">{suffix}</span>}
      </div>
      <FieldError message={error} />
    </label>
  );
}
