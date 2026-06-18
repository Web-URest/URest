"use client";

import { useState } from "react";

/**
 * Interactive 1–5 star picker (the review form). Controlled: parent owns `value`
 * and gets `onChange`. Hover previews; keyboard-accessible via radio semantics.
 * `gold-400` is the sanctioned star token.
 */
export function StarRatingInput({
  value,
  onChange,
  label,
  disabled,
}: {
  value: number; // 0 = unset
  onChange: (v: number) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={String(i)}
          disabled={disabled}
          onClick={() => onChange(i)}
          onMouseEnter={() => !disabled && setHover(i)}
          onMouseLeave={() => setHover(0)}
          className={`text-2xl leading-none transition-colors ${
            i <= shown ? "text-gold-400" : "text-ink-900/20"
          } ${disabled ? "cursor-not-allowed" : "cursor-pointer hover:text-gold-400"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
