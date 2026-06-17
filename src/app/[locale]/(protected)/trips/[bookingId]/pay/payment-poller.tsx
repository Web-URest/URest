"use client";

import { useEffect, useRef } from "react";

import { useRouter } from "@/i18n/navigation";

import { getBookingPaymentStatus } from "./actions";
import { confirmRedirectHref } from "./helpers";

/** Polls booking status while the pay screen is open; redirects once it leaves AWAITING_PAYMENT. */
export function PaymentPoller({ bookingId, payByIso }: { bookingId: string; payByIso: string }) {
  const router = useRouter();
  const stopped = useRef(false);

  useEffect(() => {
    const tick = async () => {
      if (stopped.current) return;
      if (Date.now() > new Date(payByIso).getTime()) return; // window closed; the expiry sweep handles it
      const res = await getBookingPaymentStatus(bookingId);
      if (res.ok) {
        const href = confirmRedirectHref(res.status, bookingId);
        if (href) {
          stopped.current = true;
          router.replace(href);
        }
      }
    };
    const id = setInterval(() => void tick(), 4000);
    return () => clearInterval(id);
  }, [bookingId, payByIso, router]);

  return null;
}
