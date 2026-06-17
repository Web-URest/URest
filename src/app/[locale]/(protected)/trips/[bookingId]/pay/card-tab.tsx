"use client";

export function CardTab({ bookingId, publicKey }: { bookingId: string; publicKey: string }) {
  return <p className="text-sm text-ink-900/60" data-booking={bookingId} data-pk={publicKey ? "set" : "unset"} />;
}
