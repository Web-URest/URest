"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { useRouter } from "@/i18n/navigation";

import { createInstantBooking } from "./actions";

export function InstantForm({
  listingId,
  checkIn,
  checkOut,
  guests,
}: {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}) {
  const t = useTranslations("Booking");
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createInstantBooking({ listingId, checkIn, checkOut, guests });
      if (res.ok) {
        // Straight to payment — instant has no host wait (§3.2 "then payment immediately").
        router.push(`/trips/${res.bookingId}/pay`);
        return;
      }
      if (res.error === "errorPhoneUnverified") {
        router.push("/verify-phone");
        return;
      }
      if (res.error === "errorUnauthenticated") {
        router.push("/sign-in");
        return;
      }
      setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 shadow-card">
      <Checkbox label={t("houseRules")} checked={agreed} onCheckedChange={setAgreed} />
      {error && <p className="text-sm text-coral-600">{t(error)}</p>}
      <Button variant="primary" fullWidth disabled={!agreed || pending} onClick={submit}>
        {t("instantSubmit")}
      </Button>
    </div>
  );
}
