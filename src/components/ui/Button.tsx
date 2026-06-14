import type { ButtonHTMLAttributes } from "react";

/**
 * Button — CTA primitive (DESIGN_SPEC §3/§4: pill radius, Anuphan 600, 160ms ease-out).
 * Variants encode intent:
 *   - primary: the standard aqua action (aqua-500 only ever carries ink-900 text)
 *   - money:   THE money action — coral. ONE coral per screen (DESIGN_SPEC principle 4)
 *   - teal:    solid dark action / link-button
 *   - ghost:   low-emphasis, hairline border on sand
 * Presentational + shared (usable from server and client trees); consumers attach onClick.
 */
type Variant = "primary" | "money" | "teal" | "ghost";
type Size = "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-aqua-500 text-ink-900 hover:brightness-95",
  money: "bg-coral-500 text-white hover:bg-coral-600",
  teal: "bg-teal-600 text-white hover:bg-ink-700",
  ghost: "border border-line bg-transparent text-ink-900 hover:bg-sand-100",
};

const SIZES: Record<Size, string> = {
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}
