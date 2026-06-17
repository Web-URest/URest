"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type {
  Amenity,
  BookingMode,
  CancellationTier,
  KycDocumentType,
  PartyPolicy,
} from "@prisma/client";

import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import type { SeasonRow } from "@/components/ui/SeasonEditor";
import { WizardStepper } from "@/components/ui/WizardStepper";
import type { SelectOption } from "@/components/ui/Select";
import { usePathname, useRouter } from "@/i18n/navigation";

import {
  createDraftAction,
  saveStepAction,
  submitKycAction,
} from "./actions";
import { Step1Basics } from "./steps/Step1Basics";
import { Step2Photos, type WizardPhoto } from "./steps/Step2Photos";
import { Step3Details } from "./steps/Step3Details";
import { Step4Rules } from "./steps/Step4Rules";
import { Step5Pricing } from "./steps/Step5Pricing";
import { Step6Kyc, type KycDoc, type PayoutForm } from "./steps/Step6Kyc";

/** Required KYC document types before submit (PRODUCT_FLOWS §4.1 ⑥). */
const REQUIRED_KYC: KycDocumentType[] = ["THAI_ID", "RIGHT_TO_RENT", "SELFIE"];

/** Seasonal-pricing row type lives with its editor; re-exported for step props. */
export type { SeasonRow };

/** All wizard fields, money held in baht (converted to satang at save). */
export interface WizardData {
  regionId: string;
  title: string;
  description: string;
  address: string;
  mapLat: number | null;
  mapLng: number | null;
  bedrooms: number;
  beds: number;
  baths: number;
  maxGuests: number;
  poolLengthM: number | null;
  poolWidthM: number | null;
  poolDepthM: number | null;
  amenities: Amenity[];
  partyPolicy: PartyPolicy;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  cashDepositBaht: number | null;
  checkInTime: string;
  checkOutTime: string;
  baseWeekdayBaht: number | null;
  baseWeekendBaht: number | null;
  holidayBaht: number | null;
  includedGuests: number;
  extraGuestFeeBaht: number | null;
  cancellationTier: CancellationTier;
  bookingMode: BookingMode;
  instantAck: boolean;
  seasons: SeasonRow[];
}

export interface WizardInitial {
  listingId: string | null;
  regions: SelectOption[];
  photos: WizardPhoto[];
  data: WizardData | null;
  /** Resume KYC state — the account number is never sent back (ADR-010). */
  kycSubmissionId: string | null;
  kycDocuments: KycDoc[];
  payout: { bankCode: string; accountName: string; hasSaved: boolean };
}

const DEFAULTS: WizardData = {
  regionId: "",
  title: "",
  description: "",
  address: "",
  mapLat: null,
  mapLng: null,
  bedrooms: 1,
  beds: 1,
  baths: 1,
  maxGuests: 2,
  poolLengthM: null,
  poolWidthM: null,
  poolDepthM: null,
  amenities: [],
  partyPolicy: "ASK_FIRST",
  quietHoursStart: null,
  quietHoursEnd: null,
  cashDepositBaht: 0,
  checkInTime: "15:00",
  checkOutTime: "11:00",
  baseWeekdayBaht: null,
  baseWeekendBaht: null,
  holidayBaht: null,
  includedGuests: 2,
  extraGuestFeeBaht: 0,
  cancellationTier: "MODERATE",
  bookingMode: "REQUEST",
  instantAck: false,
  seasons: [],
};

/** Baht → integer satang at the edge (rounds to whole satang, never floats). */
function toSatang(baht: number | null): number {
  return Math.round((baht ?? 0) * 100);
}

const TOTAL_STEPS = 6;

export function ListingWizard({ initial }: { initial: WizardInitial }) {
  const t = useTranslations("Wizard");
  const router = useRouter();
  const pathname = usePathname();

  const [step, setStep] = useState(1);
  const [listingId, setListingId] = useState<string | null>(initial.listingId);
  const [data, setData] = useState<WizardData>(initial.data ?? DEFAULTS);
  const [photos, setPhotos] = useState<WizardPhoto[]>(initial.photos);
  const [submissionId, setSubmissionId] = useState<string | null>(initial.kycSubmissionId);
  const [kycDocuments, setKycDocuments] = useState<KycDoc[]>(initial.kycDocuments);
  const [payout, setPayout] = useState<PayoutForm>({
    ...initial.payout,
    accountNumber: "",
  });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  function patch(p: Partial<WizardData>) {
    setData((d) => ({ ...d, ...p }));
  }

  function stepPayload(s: 1 | 3 | 4 | 5): unknown {
    switch (s) {
      case 1:
        return {
          regionId: data.regionId,
          title: data.title,
          description: data.description,
          address: data.address,
          mapLat: data.mapLat,
          mapLng: data.mapLng,
        };
      case 3:
        return {
          bedrooms: data.bedrooms,
          beds: data.beds,
          baths: data.baths,
          maxGuests: data.maxGuests,
          poolLengthM: data.poolLengthM,
          poolWidthM: data.poolWidthM,
          poolDepthM: data.poolDepthM,
          amenities: data.amenities,
        };
      case 4:
        return {
          partyPolicy: data.partyPolicy,
          quietHoursStart: data.quietHoursStart || null,
          quietHoursEnd: data.quietHoursEnd || null,
          cashDepositSatang: toSatang(data.cashDepositBaht),
          checkInTime: data.checkInTime,
          checkOutTime: data.checkOutTime,
        };
      case 5:
        return {
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
        };
    }
  }

  /** Client-side gate before saving a step (server re-validates). */
  function stepValid(s: number): string | null {
    if (s === 1 && (!data.regionId || data.title.trim().length === 0)) {
      return "errorIncomplete";
    }
    if (s === 5) {
      if (!data.baseWeekdayBaht || !data.baseWeekendBaht) return "errorIncomplete";
      if (
        data.seasons.some(
          (x) => !x.startDate || !x.endDate || !x.weekdayBaht || !x.weekendBaht,
        )
      ) {
        return "errorSeasonIncomplete";
      }
      if (data.bookingMode === "INSTANT" && !data.instantAck) return "errorInstantAck";
    }
    if (s === 6) {
      const types = new Set(kycDocuments.map((d) => d.type));
      if (!REQUIRED_KYC.every((dt) => types.has(dt)) || !consent) {
        return "errorKycIncomplete";
      }
      if (
        !payout.bankCode ||
        payout.accountNumber.trim().length === 0 ||
        payout.accountName.trim().length === 0
      ) {
        return "errorPayoutRequired";
      }
    }
    return null;
  }

  function persistStep(s: 1 | 3 | 4 | 5): Promise<boolean> {
    if (s === 1 && !listingId) {
      return createDraftAction(stepPayload(1)).then((res) => {
        if (res.ok) {
          setListingId(res.listingId);
          router.replace(`${pathname}?id=${res.listingId}`);
          return true;
        }
        setError(res.error);
        return false;
      });
    }
    if (!listingId) return Promise.resolve(false);
    return saveStepAction(listingId, s, stepPayload(s)).then((res) => {
      if (!res.ok) setError(res.error);
      return res.ok;
    });
  }

  function goNext() {
    setError(null);
    const invalid = stepValid(step);
    if (invalid) {
      setError(invalid);
      return;
    }
    startTransition(async () => {
      // Step 2 (photos) persists per-upload; just advance.
      const ok = step === 2 ? true : await persistStep(step as 1 | 3 | 4 | 5);
      if (ok) setStep((s) => Math.min(TOTAL_STEPS, s + 1));
    });
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  function submit() {
    setError(null);
    const invalid = stepValid(6);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!listingId) return;
    startTransition(async () => {
      const res = await submitKycAction(listingId, {
        bankCode: payout.bankCode,
        accountNumber: payout.accountNumber.trim(),
        accountName: payout.accountName.trim(),
      });
      if (res.ok) setSubmitted(true);
      else setError(res.error);
    });
  }

  if (submitted) {
    return (
      <div className="rounded-card border border-line bg-sand-100 p-6">
        <p className="text-lg font-semibold text-jade-500">{t("submitted")}</p>
      </div>
    );
  }

  const steps = [
    { label: t("stepBasics") },
    { label: t("stepPhotos") },
    { label: t("stepDetails") },
    { label: t("stepRules") },
    { label: t("stepPricing") },
    { label: t("stepKyc") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <WizardStepper steps={steps} current={step} onStepSelect={setStep} />
      {initial.data && step === 1 && (
        <p className="text-sm text-teal-600">{t("resumeNotice")}</p>
      )}

      <div className="rounded-card border border-line bg-white p-5 shadow-card">
        {step === 1 && (
          <Step1Basics data={data} patch={patch} regions={initial.regions} t={t} />
        )}
        {step === 2 && (
          <Step2Photos
            listingId={listingId}
            photos={photos}
            setPhotos={setPhotos}
            t={t}
          />
        )}
        {step === 3 && <Step3Details data={data} patch={patch} t={t} />}
        {step === 4 && <Step4Rules data={data} patch={patch} t={t} />}
        {step === 5 && <Step5Pricing data={data} patch={patch} t={t} />}
        {step === 6 && (
          <Step6Kyc
            listingId={listingId}
            submissionId={submissionId}
            setSubmissionId={setSubmissionId}
            documents={kycDocuments}
            setDocuments={setKycDocuments}
            payout={payout}
            setPayout={setPayout}
            consent={consent}
            setConsent={setConsent}
            t={t}
          />
        )}
      </div>

      <FieldError message={error ? t(error) : null} />

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={goBack} disabled={pending || step === 1}>
          {t("back")}
        </Button>
        {step < TOTAL_STEPS ? (
          <Button onClick={goNext} disabled={pending}>
            {pending ? t("saving") : t("next")}
          </Button>
        ) : (
          <Button variant="money" onClick={submit} disabled={pending}>
            {pending ? t("saving") : t("submit")}
          </Button>
        )}
      </div>
    </div>
  );
}
