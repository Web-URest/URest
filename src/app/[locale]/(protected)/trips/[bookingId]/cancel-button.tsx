"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { useRouter } from "@/i18n/navigation";

import { cancelBookingByGuest } from "./actions";

/** Guest cancel — arms first and shows the refund amount before firing (§3.6). */
export function CancelButton({ bookingId, refundLabel }: { bookingId: string; refundLabel: string }) {
  const t = useTranslations("Booking");
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelBookingByGuest(bookingId);
      if (res.ok) router.refresh();
      else {
        setError(t("cancelError"));
        setArmed(false);
      }
    });
  }

  if (!armed) {
    return (
      <Button variant="ghost" onClick={() => setArmed(true)}>
        {t("cancelCta")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-900/80">{t("cancelWillRefund", { amount: refundLabel })}</p>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={pending} onClick={() => setArmed(false)}>
          {t("cancelBack")}
        </Button>
        <Button variant="money" disabled={pending} onClick={cancel}>
          {t("cancelConfirm")}
        </Button>
      </div>
      {error && <p className="text-sm text-coral-600">{error}</p>}
    </div>
  );
}
