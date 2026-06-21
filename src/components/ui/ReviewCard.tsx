import type { ReactNode } from "react";
import { Avatar } from "./Avatar";
import { StarRating } from "./StarRating";
import { TrustBadge } from "./TrustBadge";

/**
 * ReviewCard — a single guest review (v3). Server component. `flagSlot` carries the
 * existing FlagReviewButton. `verifiedLabel` (translated) shows the green trust badge
 * ("ผู้เข้าพักจริง ✓"). Photo URLs are pre-resolved by the caller.
 */
export function ReviewCard({
  authorName,
  dateLabel,
  overall,
  text,
  verifiedLabel,
  photoUrls = [],
  flagSlot,
}: {
  authorName: string;
  dateLabel?: string;
  overall: number;
  text?: string | null;
  verifiedLabel?: string;
  photoUrls?: string[];
  flagSlot?: ReactNode;
}) {
  return (
    <article className="space-y-3 py-5">
      <div className="flex items-center gap-3">
        <Avatar name={authorName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-900">{authorName}</p>
          {dateLabel ? <p className="text-xs text-ink-500">{dateLabel}</p> : null}
        </div>
        {flagSlot}
      </div>
      <div className="flex items-center gap-2">
        <StarRating value={overall} />
        {verifiedLabel ? <TrustBadge label={verifiedLabel} /> : null}
      </div>
      {text ? <p className="whitespace-pre-wrap text-sm text-ink-700">{text}</p> : null}
      {photoUrls.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto">
          {photoUrls.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              className="h-20 w-20 shrink-0 rounded-photo object-cover"
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}
