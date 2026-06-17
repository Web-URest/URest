"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { NumberInput } from "@/components/ui/NumberInput";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";
import { useRouter } from "@/i18n/navigation";

import type { WizardData } from "../../new/wizard";
import { Step3Details } from "../../new/steps/Step3Details";
import { Step4Rules } from "../../new/steps/Step4Rules";
import { Step5Pricing } from "../../new/steps/Step5Pricing";
import {
  editBasicsAction,
  editDetailsAction,
  editLocationAction,
  editPricingAction,
  editRulesAction,
  type ActionResult,
  type FaqRow,
} from "./actions";
import { FaqManager } from "./faq-manager";

const toSatang = (baht: number | null) => Math.round((baht ?? 0) * 100);

/** A section card with its own save button + saving/saved/error feedback. */
function SaveCard({
  title,
  reReview = false,
  warning,
  onSave,
  afterSave,
  children,
}: {
  title: string;
  reReview?: boolean;
  warning?: string;
  onSave: () => Promise<ActionResult>;
  afterSave?: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("Host");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await onSave();
      if (res.ok) {
        setSaved(true);
        afterSave?.();
      } else setError(res.error);
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl text-ink-900">{title}</h2>
        {reReview && (
          <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800">
            {t("reReviewTag")}
          </span>
        )}
      </div>
      {warning && (
        <p className="rounded-input bg-gold-100 px-3 py-2 text-sm text-gold-800">{warning}</p>
      )}
      {children}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        {saved && <span className="text-sm font-medium text-jade-500">{t("saved")}</span>}
        <FieldError message={error ? t(error) : null} />
      </div>
    </section>
  );
}

export function EditForm({
  listingId,
  initial,
  faqInitial,
}: {
  listingId: string;
  initial: WizardData;
  faqInitial: FaqRow[];
}) {
  const t = useTranslations("Host");
  const tw = useTranslations("Wizard");
  const router = useRouter();
  const [data, setData] = useState<WizardData>(initial);

  function patch(p: Partial<WizardData>) {
    setData((d) => ({ ...d, ...p }));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Basics — no re-review */}
      <SaveCard
        title={t("sectionBasics")}
        onSave={() =>
          editBasicsAction(listingId, { title: data.title, description: data.description })
        }
      >
        <TextInput
          id="e-title"
          label={tw("titleLabel")}
          value={data.title}
          maxLength={120}
          onChange={(e) => patch({ title: e.target.value })}
        />
        <Textarea
          id="e-desc"
          label={tw("descriptionLabel")}
          value={data.description}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </SaveCard>

      {/* Location — re-review (→ PENDING_REVIEW); refresh to update the header pill */}
      <SaveCard
        title={t("sectionLocation")}
        reReview
        warning={t("locationReReviewWarning")}
        onSave={() =>
          editLocationAction(listingId, {
            address: data.address,
            mapLat: data.mapLat,
            mapLng: data.mapLng,
          })
        }
        afterSave={() => router.refresh()}
      >
        <TextInput
          id="e-address"
          label={tw("addressLabel")}
          value={data.address}
          onChange={(e) => patch({ address: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-4">
          <NumberInput
            id="e-lat"
            label={tw("mapLatLabel")}
            value={data.mapLat}
            step="any"
            onValueChange={(v) => patch({ mapLat: v })}
          />
          <NumberInput
            id="e-lng"
            label={tw("mapLngLabel")}
            value={data.mapLng}
            step="any"
            onValueChange={(v) => patch({ mapLng: v })}
          />
        </div>
      </SaveCard>

      {/* Details & amenities — no re-review */}
      <SaveCard
        title={t("sectionAmenities")}
        onSave={() =>
          editDetailsAction(listingId, {
            bedrooms: data.bedrooms,
            beds: data.beds,
            baths: data.baths,
            maxGuests: data.maxGuests,
            poolLengthM: data.poolLengthM,
            poolWidthM: data.poolWidthM,
            poolDepthM: data.poolDepthM,
            amenities: data.amenities,
          })
        }
      >
        <Step3Details data={data} patch={patch} t={tw} />
      </SaveCard>

      {/* House rules — no re-review */}
      <SaveCard
        title={t("sectionRules")}
        onSave={() =>
          editRulesAction(listingId, {
            partyPolicy: data.partyPolicy,
            quietHoursStart: data.quietHoursStart || null,
            quietHoursEnd: data.quietHoursEnd || null,
            cashDepositSatang: toSatang(data.cashDepositBaht),
            checkInTime: data.checkInTime,
            checkOutTime: data.checkOutTime,
          })
        }
      >
        <Step4Rules data={data} patch={patch} t={tw} />
      </SaveCard>

      {/* Pricing, seasons & booking mode — no re-review */}
      <SaveCard
        title={t("sectionPricing")}
        onSave={() =>
          editPricingAction(listingId, {
            baseWeekdaySatang: toSatang(data.baseWeekdayBaht),
            baseWeekendSatang: toSatang(data.baseWeekendBaht),
            holidaySatang: data.holidayBaht != null ? toSatang(data.holidayBaht) : null,
            includedGuests: data.includedGuests,
            extraGuestFeeSatang: toSatang(data.extraGuestFeeBaht),
            cancellationTier: data.cancellationTier,
            bookingMode: data.bookingMode,
            instantAck: data.instantAck,
            seasons: data.seasons.map((s) => ({
              nameTh: s.nameTh,
              startDate: s.startDate,
              endDate: s.endDate,
              weekdaySatang: toSatang(s.weekdayBaht),
              weekendSatang: toSatang(s.weekendBaht),
            })),
          })
        }
      >
        <Step5Pricing data={data} patch={patch} t={tw} />
      </SaveCard>

      {/* FAQ — own local state, no full refresh */}
      <section className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 shadow-card">
        <h2 className="font-display text-xl text-ink-900">{t("sectionFaq")}</h2>
        <FaqManager listingId={listingId} initial={faqInitial} />
      </section>

      {/* Documents & bank — editing deferred (ADR-010) */}
      <section className="flex flex-col gap-2 rounded-card border border-line bg-sand-100 p-5">
        <h2 className="font-display text-xl text-ink-900">{t("sectionDocs")}</h2>
        <p className="text-sm text-ink-700">{t("docsContactNote")}</p>
      </section>
    </div>
  );
}
