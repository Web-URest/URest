/**
 * Notification templates (Thai-first). `priority` marks the ADR-005 LINE-push
 * list. Bodies are in-code (not messages/*.json — those are UI strings).
 * Features add their own keys as they land (#21/#25/#26).
 */
export interface NotificationTemplate {
  priority: boolean;
  email(payload: Record<string, unknown>): { subject: string; body: string };
  line(payload: Record<string, unknown>): string;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

const templates: Record<string, NotificationTemplate> = {
  BOOKING_REQUESTED: {
    priority: true,
    email: (p) => ({
      subject: `มีคำขอจองใหม่ — ${str(p.listingTitle)}`,
      body: `คุณมีคำขอจองใหม่จาก ${str(p.guestName)} สำหรับ ${str(p.listingTitle)} กรุณาตอบกลับภายใน 12 ชั่วโมง`,
    }),
    line: (p) => `🔔 คำขอจองใหม่: ${str(p.listingTitle)} จาก ${str(p.guestName)} — ตอบกลับภายใน 12 ชม.`,
  },
};

export function getTemplate(key: string): NotificationTemplate | undefined {
  return templates[key];
}
