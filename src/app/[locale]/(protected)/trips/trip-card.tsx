import { getTranslations } from "next-intl/server";

import { StatusPill, type BookingStatus } from "@/components/ui/StatusPill";
import { Link } from "@/i18n/navigation";
import { formatSatang } from "@/lib/money";

import { WithdrawButton } from "./[bookingId]/withdraw-button";

export interface TripCardBooking {
  id: string;
  status: BookingStatus;
  checkIn: Date;
  checkOut: Date;
  totalSatang: number;
  listing: { title: string };
  refund: { refundSatang: number } | null;
  /** Present once the guest has reviewed this stay (#28). */
  review: { id: string } | null;
}

/** One booking in the trips list (PRODUCT_FLOWS §3.3) — status pill + per-state action. */
export async function TripCard({ booking }: { booking: TripCardBooking }) {
  const t = await getTranslations("Booking");
  const pending = booking.status === "REQUESTED" || booking.status === "AWAITING_PAYMENT";
  const active = pending || booking.status === "CONFIRMED" || booking.status === "CHECKED_IN";
  const cancelled = booking.status === "CANCELLED_BY_GUEST" || booking.status === "CANCELLED_BY_HOST";

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg text-ink-900">{booking.listing.title}</h2>
        <StatusPill status={booking.status} />
      </div>
      <p className="text-sm text-ink-900/70">
        {booking.checkIn.toISOString().slice(0, 10)} – {booking.checkOut.toISOString().slice(0, 10)} ·{" "}
        {formatSatang(booking.totalSatang)}
      </p>
      {cancelled && booking.refund && (
        <p className="text-xs font-semibold text-coral-600">
          {t("refundedPill", { amount: formatSatang(booking.refund.refundSatang) })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {booking.status === "AWAITING_PAYMENT" && (
          <Link
            href={`/trips/${booking.id}/pay`}
            className="rounded-card bg-coral-500 px-4 py-2 text-center text-sm font-semibold text-white shadow-card transition hover:brightness-95"
          >
            {t("payCta")}
          </Link>
        )}
        {active && (
          <Link
            href={`/trips/${booking.id}`}
            className="rounded-card border border-line px-4 py-2 text-center text-sm font-semibold text-ink-900 transition hover:bg-sand-50"
          >
            {t("viewStatus")}
          </Link>
        )}
        {pending && <WithdrawButton bookingId={booking.id} />}
        {booking.status === "COMPLETED" &&
          (booking.review ? (
            <span className="rounded-card px-4 py-2 text-sm font-semibold text-ink-900/50">
              {t("reviewed")}
            </span>
          ) : (
            <Link
              href={`/trips/${booking.id}/review`}
              className="rounded-card border border-line px-4 py-2 text-center text-sm font-semibold text-ink-900 transition hover:bg-sand-50"
            >
              {t("writeReview")}
            </Link>
          ))}
      </div>
    </div>
  );
}
