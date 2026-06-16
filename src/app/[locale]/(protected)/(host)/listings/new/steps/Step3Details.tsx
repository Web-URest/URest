"use client";

import { Amenity } from "@prisma/client";

import { Checkbox } from "@/components/ui/Checkbox";
import { NumberInput } from "@/components/ui/NumberInput";

import type { StepProps } from "./types";

const AMENITIES = Object.values(Amenity);

/** Wizard step ③ — capacity, pool dimensions, amenities (PRODUCT_FLOWS §4.1 ③). */
export function Step3Details({ data, patch, t }: StepProps) {
  function toggleAmenity(a: Amenity, on: boolean) {
    patch({
      amenities: on
        ? [...data.amenities, a]
        : data.amenities.filter((x) => x !== a),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <NumberInput
          id="w-bedrooms"
          label={t("bedroomsLabel")}
          min={1}
          value={data.bedrooms}
          onValueChange={(v) => patch({ bedrooms: v ?? 1 })}
        />
        <NumberInput
          id="w-beds"
          label={t("bedsLabel")}
          min={1}
          value={data.beds}
          onValueChange={(v) => patch({ beds: v ?? 1 })}
        />
        <NumberInput
          id="w-baths"
          label={t("bathsLabel")}
          min={1}
          value={data.baths}
          onValueChange={(v) => patch({ baths: v ?? 1 })}
        />
        <NumberInput
          id="w-maxguests"
          label={t("maxGuestsLabel")}
          min={1}
          value={data.maxGuests}
          onValueChange={(v) => patch({ maxGuests: v ?? 1 })}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <NumberInput
          id="w-pool-l"
          label={t("poolLengthLabel")}
          suffix={t("meters")}
          step="0.1"
          value={data.poolLengthM}
          onValueChange={(v) => patch({ poolLengthM: v })}
        />
        <NumberInput
          id="w-pool-w"
          label={t("poolWidthLabel")}
          suffix={t("meters")}
          step="0.1"
          value={data.poolWidthM}
          onValueChange={(v) => patch({ poolWidthM: v })}
        />
        <NumberInput
          id="w-pool-d"
          label={t("poolDepthLabel")}
          suffix={t("meters")}
          step="0.1"
          value={data.poolDepthM}
          onValueChange={(v) => patch({ poolDepthM: v })}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink-900">
          {t("amenitiesLabel")}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {AMENITIES.map((a) => (
            <Checkbox
              key={a}
              id={`w-amenity-${a}`}
              label={t(`amenities.${a}`)}
              checked={data.amenities.includes(a)}
              onCheckedChange={(on) => toggleAmenity(a, on)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
