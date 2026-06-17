"use client";

import { BookingMode } from "@prisma/client";
import { useTranslations } from "next-intl";

import { Checkbox } from "./Checkbox";
import { RadioGroup } from "./RadioGroup";

/**
 * BookingModeToggle — ส่งคำขอก่อน vs ⚡ จองทันที (PRODUCT_FLOWS §4.1 ⑤, §4.4).
 * Choosing ⚡ instant reveals the stale-calendar strike acknowledgment, which the
 * server also enforces (`INSTANT_ACK_REQUIRED`). Shared by the wizard step ⑤ and
 * the Edit Villa โหมดการจอง section — `Wizard` namespace strings.
 *
 * `ackLocked` (Edit page) hides the checkbox when the acknowledgment was already
 * recorded on a prior instant switch — switching back and forth is then instant.
 */
export function BookingModeToggle({
  mode,
  onModeChange,
  ack,
  onAckChange,
  ackLocked = false,
  error,
}: {
  mode: BookingMode;
  onModeChange: (mode: BookingMode) => void;
  ack: boolean;
  onAckChange: (ack: boolean) => void;
  ackLocked?: boolean;
  error?: string | null;
}) {
  const t = useTranslations("Wizard");
  const instant = mode === BookingMode.INSTANT;

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        label={t("bookingModeLabel")}
        name="booking-mode"
        value={mode}
        onValueChange={(v) => onModeChange(v as BookingMode)}
        options={[
          {
            value: BookingMode.REQUEST,
            label: t("bookingMode.REQUEST"),
            hint: t("bookingMode.REQUEST_HINT"),
          },
          {
            value: BookingMode.INSTANT,
            label: t("bookingMode.INSTANT"),
            hint: t("bookingMode.INSTANT_HINT"),
          },
        ]}
      />
      {instant && !ackLocked && (
        <Checkbox
          id="booking-mode-ack"
          checked={ack}
          onCheckedChange={onAckChange}
          label={t("instantAck")}
          error={error}
        />
      )}
    </div>
  );
}
