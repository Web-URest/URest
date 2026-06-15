import { env } from "@/lib/env";

/**
 * SMS delivery for phone-OTP (verification-ladder step 2, ADR-007).
 *
 * The real Thai SMS provider is a later config task (ADR-009 §5 — provider
 * selection is the one open tooling item). Until it lands, dev/test use a
 * console driver that prints the code; production has NO driver and OTP fails
 * closed — printing a code to production logs would leak it (ADR-010 §7).
 */
export interface SmsDriver {
  /** `to` is a normalized Thai mobile number; `message` already contains the code. */
  send(to: string, message: string): Promise<void>;
}

export const consoleSmsDriver: SmsDriver = {
  async send(to, message) {
    // Dev-only: the only place an OTP code is ever printed. Never used in prod.
    console.info(`[sms:console] → ${to}: ${message}`);
  },
};

/**
 * Pure selection policy (testable without env stubbing). In production, with no
 * real provider wired, throws so the feature is unavailable rather than leaking
 * codes via the console driver.
 */
export function selectSmsDriver(nodeEnv: string): SmsDriver {
  if (nodeEnv === "production") {
    throw new Error(
      "No production SMS provider configured — phone OTP is disabled until the " +
        "SMS-provider config PR lands (ADR-009 §5). The console driver must never " +
        "run in production (it would log OTP codes — ADR-010 §7).",
    );
  }
  return consoleSmsDriver;
}

export function getSmsDriver(): SmsDriver {
  return selectSmsDriver(env.NODE_ENV);
}
