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
  PAYMENT_RECEIVED_GUEST: {
    priority: true,
    email: (p) => ({
      subject: `ชำระเงินสำเร็จ — ยืนยันการจองแล้ว ${str(p.code)}`,
      body: `ชำระเงินสำเร็จ! การจอง ${str(p.listingTitle)} ยืนยันแล้ว รหัสจองของคุณคือ ${str(p.code)} ดูรายละเอียดและการติดต่อโฮสต์ได้ในแอป`,
    }),
    line: (p) => `✅ ชำระเงินสำเร็จ! ยืนยันการจอง ${str(p.listingTitle)} แล้ว — รหัสจอง ${str(p.code)}`,
  },
  PAYMENT_RECEIVED_HOST: {
    priority: true,
    email: (p) => ({
      subject: `การจองยืนยันแล้ว ${str(p.code)} — เตรียมต้อนรับแขก`,
      body: `แขกชำระเงินสำหรับ ${str(p.listingTitle)} แล้ว การจองยืนยันเรียบร้อย รหัสจอง ${str(p.code)} เตรียมต้อนรับแขกได้เลย`,
    }),
    line: (p) => `🎉 ยืนยันการจอง ${str(p.code)}: ${str(p.listingTitle)} — แขกชำระเงินแล้ว`,
  },
  PAYMENT_EXPIRED_HOST: {
    priority: true,
    email: (p) => ({
      subject: `คำขอจอง ${str(p.listingTitle)} หมดเวลาชำระเงิน`,
      body: `แขกไม่ได้ชำระเงินภายในเวลาที่กำหนดสำหรับ ${str(p.listingTitle)} วันที่ถูกปล่อยคืนแล้วและพร้อมรับการจองใหม่`,
    }),
    line: (p) => `⏰ ${str(p.listingTitle)} หมดเวลาชำระเงิน — ปล่อยวันที่ว่างแล้ว พร้อมรับจองใหม่`,
  },
  PAYMENT_REMINDER_GUEST: {
    priority: true,
    email: (p) => ({
      subject: `เหลือเวลา 2 ชั่วโมง — ชำระเงินเพื่อยืนยันการจอง ${str(p.listingTitle)}`,
      body: `เหลือเวลาอีกประมาณ 2 ชั่วโมงในการชำระเงินสำหรับ ${str(p.listingTitle)} ชำระเงินเลยเพื่อไม่ให้เสียวันที่จองนี้ไป`,
    }),
    line: (p) => `⏰ เหลือเวลา 2 ชม. ชำระเงินเพื่อยืนยันการจอง ${str(p.listingTitle)} — อย่าให้วันที่หลุดไปนะคะ`,
  },
  PAYMENT_REFUNDED_GUEST: {
    priority: true,
    email: (p) => ({
      subject: `คืนเงินเต็มจำนวนแล้ว — ${str(p.listingTitle)}`,
      body: `ขออภัย วันที่ของ ${str(p.listingTitle)} ไม่ว่างแล้วในจังหวะที่ชำระเงินเข้ามา เราได้คืนเงินเต็มจำนวนให้คุณเรียบร้อยแล้ว (อาจใช้เวลา 2–3 วันทำการกว่าจะเห็นในบัญชี)`,
    }),
    line: (p) => `↩️ คืนเงินเต็มจำนวนแล้วสำหรับ ${str(p.listingTitle)} — วันที่ไม่ว่างพอดีตอนชำระเงิน ขออภัยในความไม่สะดวกค่ะ`,
  },
};

export function getTemplate(key: string): NotificationTemplate | undefined {
  return templates[key];
}
