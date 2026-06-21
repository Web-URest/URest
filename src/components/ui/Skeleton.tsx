/**
 * Skeleton — loading placeholders (v3). Shimmer via the `shimmer` keyframe in
 * globals.css (neutralized under prefers-reduced-motion → static surface). Base
 * primitive + a few composed shapes used by route-level loading.tsx files.
 */
type Rounded = "input" | "card" | "photo" | "pill" | "full";

const ROUND: Record<Rounded, string> = {
  input: "rounded-input",
  card: "rounded-card",
  photo: "rounded-photo",
  pill: "rounded-pill",
  full: "rounded-full",
};

export function Skeleton({
  className = "",
  rounded = "input",
}: {
  className?: string;
  rounded?: Rounded;
}) {
  return (
    <span
      aria-hidden
      className={`relative block overflow-hidden bg-surface-50 ${ROUND[rounded]} ${className}`}
    >
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/70 to-transparent [animation:shimmer_1.4s_infinite]" />
    </span>
  );
}

export function VillaCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton rounded="photo" className="aspect-[3/2] w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-card border border-border-subtle p-4">
      <Skeleton rounded="photo" className="h-20 w-28 shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton rounded="pill" className="h-8 w-20" />
    </div>
  );
}

export function ReserveCardSkeleton() {
  return (
    <div className="space-y-4 rounded-modal border border-border p-6 shadow-card">
      <Skeleton className="h-6 w-2/5" />
      <Skeleton rounded="input" className="h-14 w-full" />
      <Skeleton rounded="input" className="h-12 w-full" />
      <Skeleton rounded="pill" className="h-12 w-full" />
    </div>
  );
}

export function DetailHeroSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr]">
      <Skeleton rounded="photo" className="aspect-[3/2] w-full" />
      <div className="hidden grid-rows-2 gap-2 md:grid">
        <Skeleton rounded="photo" className="w-full" />
        <Skeleton rounded="photo" className="w-full" />
      </div>
    </div>
  );
}
