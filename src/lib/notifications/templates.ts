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
  REQUEST_ACCEPTED: {
    priority: true,
    email: (p) => ({
      subject: `โฮสต์ยืนยันแล้ว — ชำระเงินเพื่อยืนยันการจอง ${str(p.listingTitle)}`,
      body: `โฮสต์ยืนยันคำขอจอง ${str(p.listingTitle)} แล้ว กรุณาชำระเงินภายใน 12 ชั่วโมงเพื่อยืนยันการจอง`,
    }),
    line: (p) => `✅ โฮสต์ยืนยัน ${str(p.listingTitle)} แล้ว — ชำระเงินภายใน 12 ชม. เพื่อยืนยันการจอง`,
  },
  REQUEST_DECLINED: {
    priority: false,
    email: (p) => ({
      subject: `คำขอจอง ${str(p.listingTitle)} ไม่ได้รับการยืนยัน`,
      body: `ขออภัย โฮสต์ไม่สามารถรับคำขอจอง ${str(p.listingTitle)} ได้ ลองค้นหาที่พักอื่นที่ว่างในช่วงเวลาเดียวกันได้เลย`,
    }),
    line: (p) => `คำขอจอง ${str(p.listingTitle)} ไม่ได้รับการยืนยัน — ลองดูที่พักอื่นที่ว่างนะคะ`,
  },
  REQUEST_EXPIRED: {
    priority: false,
    email: (p) => ({
      subject: `คำขอจอง ${str(p.listingTitle)} หมดเวลา`,
      body: `คำขอจอง ${str(p.listingTitle)} หมดเวลารอโฮสต์ยืนยัน (12 ชั่วโมง) ลองส่งคำขอใหม่หรือเลือกที่พักอื่นได้เลย`,
    }),
    line: (p) => `⏰ คำขอจอง ${str(p.listingTitle)} หมดเวลารอโฮสต์ — ลองส่งใหม่หรือดูที่พักอื่นนะคะ`,
  },
};

export function getTemplate(key: string): NotificationTemplate | undefined {
  return templates[key];
}
