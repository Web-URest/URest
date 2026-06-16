"use client";

import type { InputHTMLAttributes } from "react";

import { FieldError } from "./FieldError";

/**
 * TextInput — labelled single-line text field (DESIGN_SPEC §3: 12px radius,
 * sand-100 fill, aqua focus ring). The label is passed in already-translated
 * (Thai-first via next-intl); this primitive holds no copy of its own.
 */
export function TextInput({
  label,
  error,
  id,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
}) {
  return (
    <label className="flex flex-col gap-2" htmlFor={id}>
      <span className="text-sm font-medium text-ink-900">{label}</span>
      <input
        id={id}
        className={`rounded-input border border-line bg-sand-100 px-4 py-3 text-ink-900 outline-none focus:ring-2 focus:ring-aqua-500 disabled:opacity-50 ${className}`}
        {...props}
      />
      <FieldError message={error} />
    </label>
  );
}
