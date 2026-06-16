"use client";

import { NumberInput } from "@/components/ui/NumberInput";
import { Select, type SelectOption } from "@/components/ui/Select";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";

import type { StepProps } from "./types";

/** Wizard step ① — region, title, description, address, map pin (PRODUCT_FLOWS §4.1). */
export function Step1Basics({
  data,
  patch,
  regions,
  t,
}: StepProps & { regions: SelectOption[] }) {
  return (
    <div className="flex flex-col gap-5">
      <Select
        id="w-region"
        label={t("regionLabel")}
        placeholder={t("regionPlaceholder")}
        options={regions}
        value={data.regionId}
        onChange={(e) => patch({ regionId: e.target.value })}
      />
      <TextInput
        id="w-title"
        label={t("titleLabel")}
        value={data.title}
        maxLength={120}
        onChange={(e) => patch({ title: e.target.value })}
      />
      <Textarea
        id="w-desc"
        label={t("descriptionLabel")}
        value={data.description}
        onChange={(e) => patch({ description: e.target.value })}
      />
      <TextInput
        id="w-address"
        label={t("addressLabel")}
        value={data.address}
        onChange={(e) => patch({ address: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-4">
        <NumberInput
          id="w-lat"
          label={t("mapLatLabel")}
          value={data.mapLat}
          step="any"
          onValueChange={(v) => patch({ mapLat: v })}
        />
        <NumberInput
          id="w-lng"
          label={t("mapLngLabel")}
          value={data.mapLng}
          step="any"
          onValueChange={(v) => patch({ mapLng: v })}
        />
      </div>
    </div>
  );
}
