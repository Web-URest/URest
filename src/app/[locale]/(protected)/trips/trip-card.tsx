import { getTranslations } from "next-intl/server";

import { StatusPill, type BookingStatus } from "@/components/ui/StatusPill";
import { EscrowStrip } from "@/components/ui/EscrowStrip";
import { Link } from "@/i18n/navigation";
import { formatSatang } from "@/lib/money";

import { WithdrawButton } from "./[bookingId]/withdraw-button";

export interface TripCardBooking {
  id: string;
  status: BookingStatus;
  checkIn: Date;
  checkOut: Date;
  totalSatang: number;
  listing: { title: string; photos: { r2Key: string }[] };
  refund: { refundSatang: number } | null;
  /** Present once the guest has reviewed this stay (#28). */
  review: { id: string } | null;
}

const PLACEHOLDER =
  "linear-gradient(150deg, var(--color-surface-100) 0%, var(--color-surface-50) 100%)";

// Where the money sits (compact escrow strip) per booking lifecycle stage.
function escrowStep(status: BookingStatus): 1 | 2 | 3 | null {
  if (status === "AWAITING_PAYMENT") return 1;
  if (status === "CONFIRMED" || status === "CHECKED_IN") return 2;
  if (status === "COMPLETED") return 3;
  return null;
}

/** One booking in the trips list (PRODUCT_FLOWS §3.3) — photo, status pill, per-state action. */
export async function TripCard({ booking }: { booking: TripCardBooking }) {
  const t = await getTranslations("Booking");
  const pending = booking.status === "REQUESTED" || booking.status === "AWAITING_PAYMENT";
  const active = pending || booking.status === "CONFIRMED" || booking.status === "CHECKED_IN";
  const cancelled = booking.status === "CANCELLED_BY_GUEST" || booking.status === "CANCELLED_BY_HOST";
  const cover = booking.listing.photos[0]?.r2Key;
  const step = escrowStep(booking.status);

  return (
    <div className="overflow-hidden rounded-card border border-border-subtle bg-white shadow-card">
      <div className="flex gap-4 p-4">
        <div
          role="img"
          aria-label={booking.listing.title}
          className="h-24 w-32 shrink-0 rounded-photo bg-cover bg-center"
          style={{
            backgroundImage: cover?.startsWith("https://")
              ? `url("${cover}")`
              : PLACEHOLDER,
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-ink-900">
              {booking.listing.title}
            </h2>
            <StatusPill status={booking.status} />
          </div>
          <p className="text-sm text-ink-700">
            {booking.checkIn.toISOString().slice(0, 10)} –{" "}
            {booking.checkOut.toISOString().slice(0, 10)} · {formatSatang(booking.totalSatang)}
          </p>
          {cancelled && booking.refund ? (
            <p className="text-xs font-semibold text-error-600">
              {t("refundedPill", { amount: formatSatang(booking.refund.refundSatang) })}
            </p>
          ) : null}

          <div className="mt-1 flex flex-wrap items-center gap-2">
            {booking.status === "AWAITING_PAYMENT" ? (
              <Link
                href={`/trips/${booking.id}/pay`}
                className="rounded-pill bg-error-500 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-error-600"
              >
                {t("payCta")}
              </Link>
            ) : null}
            {active ? (
              <Link
                href={`/trips/${booking.id}`}
                className="rounded-pill border border-border px-4 py-2 text-center text-sm font-semibold text-ink-900 transition hover:bg-surface-50"
              >
                {t("viewStatus")}
              </Link>
            ) : null}
            {pending ? <WithdrawButton bookingId={booking.id} /> : null}
            {booking.status === "COMPLETED" ? (
              booking.review ? (
                <span className="px-1 text-sm font-semibold text-ink-500">{t("reviewed")}</span>
              ) : (
                <Link
                  href={`/trips/${booking.id}/review`}
                  className="rounded-pill border border-border px-4 py-2 text-center text-sm font-semibold text-ink-900 transition hover:bg-surface-50"
                >
                  {t("writeReview")}
                </Link>
              )
            ) : null}
          </div>
        </div>
      </div>
      {step ? (
        <div className="border-t border-border-subtle px-4 py-3">
          <EscrowStrip variant="compact" step={step} audience="guest" />
        </div>
      ) : null}
    </div>
  );
}
