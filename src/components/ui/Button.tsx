import type { ButtonHTMLAttributes } from "react";

/**
 * Button — CTA primitive (v3 "AirBnB skin"). Anuphan 600; pill by default.
 * Variants encode intent (v3 rose-primary / green-trust / ink-money split):
 *   - primary:     THE brand action — rose. Most CTAs.
 *   - money:       THE pay/money action — solid ink. One per money screen (3-way split).
 *   - trust:       success/confirm action — green (escrow-safe meaning).
 *   - ghost:       low-emphasis, hairline border.
 *   - destructive: cancel/delete — red.
 *   - link:        text-only brand button (brand-700 passes AA on white).
 *   - teal:        DEPRECATED alias of `trust` (kept so existing callers don't break).
 * Presentational + shared (usable from server and client trees); consumers attach onClick.
 */
type Variant = "primary" | "money" | "trust" | "ghost" | "destructive" | "link" | "teal";
type Size = "sm" | "md" | "lg";
type Radius = "pill" | "input";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-600",
  money: "bg-ink-900 text-white hover:bg-ink-700",
  trust: "bg-trust-500 text-white hover:bg-trust-600",
  teal: "bg-trust-500 text-white hover:bg-trust-600",
  ghost: "border border-border bg-transparent text-ink-900 hover:bg-surface-50",
  destructive: "bg-error-500 text-white hover:bg-error-600",
  link: "bg-transparent px-0 py-0 text-brand-700 underline-offset-4 hover:underline",
};

const SIZES: Record<Size, string> = {
  sm: "px-3.5 py-2 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

const RADII: Record<Radius, string> = {
  pill: "rounded-pill",
  input: "rounded-input",
};

export function Button({
  variant = "primary",
  size = "md",
  radius = "pill",
  fullWidth = false,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  radius?: Radius;
  fullWidth?: boolean;
}) {
  const sizeCls = variant === "link" ? "text-sm" : SIZES[size];
  const radiusCls = variant === "link" ? "" : RADII[radius];
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${sizeCls} ${radiusCls} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}
