import { Avatar } from "./Avatar";
import { TrustBadge } from "./TrustBadge";

/**
 * HostProfileCard — host snippet on listing detail (v3). Server component. `verifiedLabel`
 * (translated) shows the green trust badge; `lines` are already-formatted facts
 * (response time, listings count, joined year). `superhostLabel` is an optional rose tag.
 */
export function HostProfileCard({
  name,
  avatarUrl,
  verifiedLabel,
  superhostLabel,
  lines = [],
}: {
  name: string;
  avatarUrl?: string | null;
  verifiedLabel?: string;
  superhostLabel?: string;
  lines?: string[];
}) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-border-subtle p-4">
      <Avatar name={name} src={avatarUrl} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-lg font-semibold text-ink-900">{name}</p>
          {verifiedLabel ? <TrustBadge label={verifiedLabel} /> : null}
          {superhostLabel ? (
            <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              {superhostLabel}
            </span>
          ) : null}
        </div>
        {lines.length > 0 ? (
          <p className="mt-1 text-sm text-ink-500">{lines.join(" · ")}</p>
        ) : null}
      </div>
    </div>
  );
}
