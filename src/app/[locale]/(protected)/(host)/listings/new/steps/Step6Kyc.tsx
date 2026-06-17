"use client";

import { useRef, useTransition } from "react";
import type { KycDocumentType } from "@prisma/client";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { TextInput } from "@/components/ui/TextInput";
import { THAI_BANKS } from "@/lib/payout/banks";

import { addKycDocumentAction, removeKycDocumentAction } from "../actions";

/** A KYC document the host has uploaded this session (id + slot type). */
export interface KycDoc {
  id: string;
  type: KycDocumentType;
}

/** Payout-account form state. `hasSaved` means an account already exists
 * (ADR-010: the number is encrypted and never sent back — re-enter to change). */
export interface PayoutForm {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  hasSaved: boolean;
}

type T = (key: string, values?: Record<string, string | number>) => string;

const ACCEPT = "image/jpeg,image/png,application/pdf";

/** Upload slots in display order; the first three are required (§4.1 ⑥). */
const SLOTS: { type: KycDocumentType; required: boolean; redact?: boolean }[] = [
  { type: "THAI_ID", required: true, redact: true },
  { type: "RIGHT_TO_RENT", required: true },
  { type: "SELFIE", required: true },
  { type: "HOTEL_LICENSE", required: false },
];

/**
 * Wizard step ⑥ — KYC (PRODUCT_FLOWS §4.1 ⑥, ADR-007/010). Uploads go straight
 * to the PRIVATE bucket via a presigned PUT (mirrors step ②); documents are not
 * previewed here (signed-read is admin-only, #14). Captures the payout account
 * (number encrypted server-side) and the KYC_PROCESSING consent. The wizard's
 * submit button finalizes + flips the listing to PENDING_REVIEW.
 */
export function Step6Kyc({
  listingId,
  submissionId,
  setSubmissionId,
  documents,
  setDocuments,
  payout,
  setPayout,
  consent,
  setConsent,
  t,
}: {
  listingId: string | null;
  submissionId: string | null;
  setSubmissionId: (id: string) => void;
  documents: KycDoc[];
  setDocuments: (next: KycDoc[]) => void;
  payout: PayoutForm;
  setPayout: (next: PayoutForm) => void;
  consent: boolean;
  setConsent: (next: boolean) => void;
  t: T;
}) {
  const [pending, startTransition] = useTransition();

  if (!listingId) {
    return <p className="text-ink-700">{t("errorIncomplete")}</p>;
  }

  function upload(type: KycDocumentType, file: File) {
    if (!listingId) return;
    startTransition(async () => {
      const res = await addKycDocumentAction(listingId, type, {
        contentType: file.type,
        byteLength: file.size,
      });
      if (!res.ok) return;
      setSubmissionId(res.submissionId);
      try {
        const put = await fetch(res.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error("upload failed");
        setDocuments([...documents, { id: res.document.id, type: res.document.type }]);
      } catch {
        // Upload didn't land — drop the row we just created (no orphan).
        await removeKycDocumentAction(res.submissionId, res.document.id);
      }
    });
  }

  function remove(docId: string) {
    if (!submissionId) return;
    startTransition(async () => {
      const res = await removeKycDocumentAction(submissionId, docId);
      if (res.ok) setDocuments(documents.filter((d) => d.id !== docId));
    });
  }

  const bankOptions = THAI_BANKS.map((b) => ({ value: b.code, label: b.nameTh }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="font-display text-xl text-ink-900">{t("kycTitle")}</span>
        <p className="text-sm text-ink-700">{t("kycHint")}</p>
      </div>

      <div className="flex flex-col gap-3">
        {SLOTS.map((slot) => (
          <DocSlot
            key={slot.type}
            slot={slot}
            doc={documents.find((d) => d.type === slot.type)}
            pending={pending}
            onUpload={upload}
            onRemove={remove}
            t={t}
          />
        ))}
      </div>

      <div className="flex flex-col gap-4 border-t border-line pt-5">
        <span className="text-sm font-medium text-ink-900">{t("payoutTitle")}</span>
        <Select
          id="kyc-bank"
          label={t("payoutBankLabel")}
          placeholder={t("payoutBankPlaceholder")}
          options={bankOptions}
          value={payout.bankCode}
          onChange={(e) => setPayout({ ...payout, bankCode: e.target.value })}
        />
        <TextInput
          id="kyc-acct-number"
          label={t("payoutNumberLabel")}
          inputMode="numeric"
          value={payout.accountNumber}
          placeholder={payout.hasSaved ? t("payoutSavedMasked") : undefined}
          onChange={(e) => setPayout({ ...payout, accountNumber: e.target.value })}
        />
        <TextInput
          id="kyc-acct-name"
          label={t("payoutNameLabel")}
          value={payout.accountName}
          onChange={(e) => setPayout({ ...payout, accountName: e.target.value })}
        />
        <p className="text-sm text-coral-600">{t("kycNameMatchWarning")}</p>
      </div>

      <Checkbox
        id="kyc-consent"
        label={t("kycConsentLabel")}
        checked={consent}
        onCheckedChange={setConsent}
      />
    </div>
  );
}

/** One document upload row: label + redaction/optional notes, upload or uploaded state. */
function DocSlot({
  slot,
  doc,
  pending,
  onUpload,
  onRemove,
  t,
}: {
  slot: { type: KycDocumentType; required: boolean; redact?: boolean };
  doc: KycDoc | undefined;
  pending: boolean;
  onUpload: (type: KycDocumentType, file: File) => void;
  onRemove: (docId: string) => void;
  t: T;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2 rounded-input border border-line bg-sand-100 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink-900">
          {t(`kycDocTypes.${slot.type}`)}
        </span>
        {doc ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-jade-500">✓ {t("kycUploaded")}</span>
            <button
              type="button"
              onClick={() => onRemove(doc.id)}
              disabled={pending}
              className="text-xs text-ink-700 underline"
            >
              {t("removeDocument")}
            </button>
          </div>
        ) : (
          <Button
            variant="ghost"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
          >
            {t("addDocument")}
          </Button>
        )}
      </div>
      {!slot.required && (
        <span className="text-xs text-teal-600">{t("kycOptionalBadge")}</span>
      )}
      {slot.redact && (
        <p className="text-xs text-coral-600">{t("kycRedactNote")}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(slot.type, file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
