"use client";

import type { TextareaHTMLAttributes } from "react";

import { FieldError } from "./FieldError";

/** Textarea — labelled multi-line field; matches TextInput styling. */
export function Textarea({
  label,
  error,
  id,
  className = "",
  rows = 4,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string | null;
}) {
  return (
    <label className="flex flex-col gap-2" htmlFor={id}>
      <span className="text-sm font-medium text-ink-900">{label}</span>
      <textarea
        id={id}
        rows={rows}
        className={`rounded-input border border-line bg-sand-100 px-4 py-3 text-ink-900 outline-none focus:ring-2 focus:ring-aqua-500 disabled:opacity-50 ${className}`}
        {...props}
      />
      <FieldError message={error} />
    </label>
  );
}
