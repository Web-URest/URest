"use client";

import { PartyPolicy } from "@prisma/client";

import { NumberInput } from "@/components/ui/NumberInput";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { TextInput } from "@/components/ui/TextInput";

import type { StepProps } from "./types";

const PARTY_POLICIES = Object.values(PartyPolicy);

/** Wizard step ④ — party policy, quiet hours, deposit, check-in/out (PRODUCT_FLOWS §4.1 ④). */
export function Step4Rules({ data, patch, t }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      <RadioGroup
        label={t("partyPolicyLabel")}
        name="w-party"
        value={data.partyPolicy}
        onValueChange={(v) => patch({ partyPolicy: v as PartyPolicy })}
        options={PARTY_POLICIES.map((p) => ({
          value: p,
          label: t(`partyPolicy.${p}`),
        }))}
      />

      <div className="grid grid-cols-2 gap-4">
        <TextInput
          id="w-quiet-start"
          label={t("quietHoursStartLabel")}
          type="time"
          value={data.quietHoursStart ?? ""}
          onChange={(e) => patch({ quietHoursStart: e.target.value || null })}
        />
        <TextInput
          id="w-quiet-end"
          label={t("quietHoursEndLabel")}
          type="time"
          value={data.quietHoursEnd ?? ""}
          onChange={(e) => patch({ quietHoursEnd: e.target.value || null })}
        />
      </div>

      <NumberInput
        id="w-deposit"
        label={t("cashDepositLabel")}
        prefix="฿"
        value={data.cashDepositBaht}
        min={0}
        onValueChange={(v) => patch({ cashDepositBaht: v })}
      />

      <div className="grid grid-cols-2 gap-4">
        <TextInput
          id="w-checkin"
          label={t("checkInLabel")}
          type="time"
          value={data.checkInTime}
          onChange={(e) => patch({ checkInTime: e.target.value })}
        />
        <TextInput
          id="w-checkout"
          label={t("checkOutLabel")}
          type="time"
          value={data.checkOutTime}
          onChange={(e) => patch({ checkOutTime: e.target.value })}
        />
      </div>
    </div>
  );
}
