"use client";

import type { SelectHTMLAttributes } from "react";

import { FieldError } from "./FieldError";

export interface SelectOption {
  value: string;
  label: string;
}

/** Select — labelled dropdown; options are passed already-translated. */
export function Select({
  label,
  error,
  id,
  options,
  placeholder,
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string | null;
  options: readonly SelectOption[];
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-2" htmlFor={id}>
      <span className="text-sm font-medium text-ink-900">{label}</span>
      <select
        id={id}
        className={`rounded-input border border-line bg-sand-100 px-4 py-3 text-ink-900 outline-none focus:ring-2 focus:ring-aqua-500 disabled:opacity-50 ${className}`}
        {...props}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </label>
  );
}
