"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { useRouter } from "@/i18n/navigation";

import { cancelBookingByHost } from "./actions";

/** Host-cancel is destructive (100% refund + a strike), so it arms before firing. */
export function HostCancelButton({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Host.bookings");
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelBookingByHost(bookingId);
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
        {t("cancel")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-coral-600">{t("cancelWarn")}</p>
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
