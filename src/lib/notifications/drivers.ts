/**
 * Notification delivery drivers (ADR-005). Console drivers print in dev/test;
 * Resend (email) + LINE Messaging (push) drivers hit real APIs in prod. Selection
 * mirrors the OTP `selectSmsDriver` pattern: pure functions of (nodeEnv, key).
 */
import { env } from "@/lib/env";

export interface EmailDriver {
  send(to: string, subject: string, body: string): Promise<void>;
}
export interface LineDriver {
  push(lineUserId: string, text: string): Promise<void>;
}

const EMAIL_FROM = "U-Rest <noreply@urest.app>"; // sender domain verified in Resend before launch

export const consoleEmailDriver: EmailDriver = {
  async send(to, subject, body) {
    console.info(`[email:console] → ${to} | ${subject}\n${body}`);
  },
};
export const consoleLineDriver: LineDriver = {
  async push(lineUserId, text) {
    console.info(`[line:console] → ${lineUserId}: ${text}`);
  },
};

export const resendEmailDriver: EmailDriver = {
  async send(to, subject, body) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html: body }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  },
};
export const lineMessagingDriver: LineDriver = {
  async push(lineUserId, text) {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text }] }),
    });
    if (!res.ok) throw new Error(`LINE ${res.status}: ${await res.text()}`);
  },
};

/** Email = channel of record: Resend if keyed, else console (dev/test), else throw (prod). */
export function selectEmailDriver(nodeEnv: string, apiKey: string | undefined): EmailDriver {
  if (apiKey) return resendEmailDriver;
  if (nodeEnv === "production") {
    throw new Error("No RESEND_API_KEY in production — email is the channel of record (ADR-005).");
  }
  return consoleEmailDriver;
}
export function getEmailDriver(): EmailDriver {
  return selectEmailDriver(env.NODE_ENV, env.RESEND_API_KEY);
}

/** LINE = best-effort push: real if keyed, else console (dev/test), else null (skip in prod). */
export function selectLineDriver(nodeEnv: string, token: string | undefined): LineDriver | null {
  if (token) return lineMessagingDriver;
  if (nodeEnv === "production") return null;
  return consoleLineDriver;
}
export function getLineDriver(): LineDriver | null {
  return selectLineDriver(env.NODE_ENV, env.LINE_CHANNEL_ACCESS_TOKEN);
}
