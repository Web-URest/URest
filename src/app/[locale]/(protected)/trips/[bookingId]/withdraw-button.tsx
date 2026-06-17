"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { useRouter } from "@/i18n/navigation";
import { withdrawRequest } from "@/app/[locale]/(protected)/(host)/requests/actions";

export function WithdrawButton({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Booking");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function withdraw() {
    setError(null);
    startTransition(async () => {
      const res = await withdrawRequest(bookingId);
      if (res.ok) router.refresh();
      else setError(t("withdrawError"));
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="ghost" disabled={pending} onClick={withdraw}>
        {t("withdraw")}
      </Button>
      {error && <p className="text-sm text-coral-600">{error}</p>}
    </div>
  );
}
