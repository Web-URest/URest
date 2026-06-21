/**
 * Avatar — user/host image with initial fallback (v3). Presentational, server-renderable.
 * Extracted so Topbar, UserMenu, HostProfileCard, ReviewCard share one avatar.
 */
type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-14 w-14 text-lg",
};

function initial(name?: string | null): string {
  const c = (name ?? "").trim().charAt(0);
  return c ? c.toUpperCase() : "·";
}

export function Avatar({
  name,
  src,
  size = "md",
  ring = false,
  className = "",
}: {
  name?: string | null;
  src?: string | null;
  size?: Size;
  ring?: boolean;
  className?: string;
}) {
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-50 font-semibold text-ink-700 ${
    ring ? "ring-2 ring-white shadow-card" : "border border-border-subtle"
  } ${SIZES[size]} ${className}`;

  if (src) {
    return (
      <span className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name ?? ""} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className={base} aria-hidden>
      {initial(name)}
    </span>
  );
}
