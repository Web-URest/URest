/**
 * Where the poller should send the guest given the latest booking status.
 * CONFIRMED → the trip page (success). Any terminal non-payable status
 * (EXPIRED / cancelled) → also leave the pay screen back to the trip page.
 * AWAITING_PAYMENT → null (keep polling).
 */
export function confirmRedirectHref(status: string, bookingId: string): string | null {
  return status === "AWAITING_PAYMENT" ? null : `/trips/${bookingId}`;
}

/** The PromptPay QR image URL on an Opn charge, if present. */
export function qrUrlFromCharge(charge: {
  source?: { scannable_code?: { image?: { download_uri?: string } } } | null;
}): string | undefined {
  return charge.source?.scannable_code?.image?.download_uri;
}
