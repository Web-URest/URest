"use server";

import { requireUser } from "@/lib/auth/guards";
import {
  requestPhoneOtp,
  verifyPhoneOtp,
  type RequestResult,
  type VerifyResult,
} from "@/lib/otp/otp";

/**
 * Server actions for the verification-ladder step-2 UI. The user is resolved
 * from the session (never trusted from the client); `requireUser` also enforces
 * suspend/ban (ADR-010). The actual OTP logic + rate/attempt limits live in
 * `lib/otp` — these are thin, authenticated entry points.
 */

export async function sendCodeAction(phone: string): Promise<RequestResult> {
  const user = await requireUser();
  return requestPhoneOtp(user.id, phone);
}

export async function confirmCodeAction(code: string): Promise<VerifyResult> {
  const user = await requireUser();
  return verifyPhoneOtp(user.id, code);
}
