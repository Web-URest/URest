import type { ButtonHTMLAttributes } from "react";

/**
 * IconButton — circular icon button (v3). Used for header icons, lightbox/sheet
 * controls, carousel chevrons. `label` is required → becomes aria-label (a11y).
 * `tone="onScrim"` for controls over photos/dark overlays.
 */
type Size = "sm" | "md";
type Tone = "default" | "onScrim";

const SIZES: Record<Size, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
};

const TONES: Record<Tone, string> = {
  default: "text-ink-700 hover:bg-surface-50",
  onScrim: "bg-black/40 text-white hover:bg-black/60",
};

export function IconButton({
  label,
  size = "md",
  tone = "default",
  className = "",
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: Size;
  tone?: Tone;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-full transition duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 ${SIZES[size]} ${TONES[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
