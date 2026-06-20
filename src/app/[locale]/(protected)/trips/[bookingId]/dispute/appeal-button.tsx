"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { useRouter } from "@/i18n/navigation";

import { appealDisputeAction } from "./actions";

/**
 * One-tap appeal of a resolved dispute (§5.3: "one appeal each, then final").
 * The server enforces the one-per-side limit; this just submits and refreshes.
 */
export function AppealButton({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Disputes");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function appeal() {
    setError(null);
    startTransition(async () => {
      const res = await appealDisputeAction(bookingId);
      if (res.ok) {
        router.refresh();
      } else {
        setError(t("appealError"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" onClick={appeal} disabled={pending}>
        {pending ? t("submitting") : t("appeal")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-coral-600">
          {error}
        </p>
      )}
    </div>
  );
}
