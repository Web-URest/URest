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

import { formatSatang } from "@/lib/money";

const str = (v: unknown): string => (typeof v === "string" ? v : "");
/** Format a satang amount for display in a notification body (the user-facing edge). */
const satang = (v: unknown): string => (typeof v === "number" ? formatSatang(v) : "");

/**
 * Thai labels for the §5.1 NEEDS_INFO checklist. Notifications are a Thai-only
 * channel of record (the UI uses i18n keys separately); the keys mirror
 * `NEEDS_INFO_ITEM_KEYS` in lib/kyc/review.
 */
const NEEDS_INFO_LABELS_TH: Record<string, string> = {
  THAI_ID_UNCLEAR: "บัตรประชาชนไม่ชัด/ถ่ายใหม่",
  RIGHT_TO_RENT_DOC: "เอกสารสิทธิ์/โฉนด",
  RENTAL_CONSENT: "สัญญาเช่า + หนังสือยินยอมให้ปล่อยเช่าช่วง",
  SELFIE_WITH_ID: "เซลฟี่คู่บัตร",
  REMAP_PIN: "ปักหมุดแผนที่ใหม่",
  MORE_PHOTOS: "รูปที่พักเพิ่มเติม",
  BANK_NAME_MISMATCH: "ชื่อบัญชีธนาคารไม่ตรงกับบัตร",
};

/** Thai labels for ReportCategory — notifications are a Thai-only channel of record. */
const REPORT_CATEGORY_LABELS_TH: Record<string, string> = {
  DOESNT_MATCH_LISTING: "ไม่ตรงตามประกาศ",
  CLEANLINESS: "ความสะอาด",
  SAFETY: "ความปลอดภัย",
  HOST_BEHAVIOR: "พฤติกรรมโฮสต์",
  SUSPECTED_FRAUD: "สงสัยมิจฉาชีพ",
  OTHER: "อื่น ๆ",
};
const reportCategory = (v: unknown): string =>
  (typeof v === "string" && REPORT_CATEGORY_LABELS_TH[v]) || "เรื่องที่แจ้ง";

/** Render the NEEDS_INFO checklist payload as a Thai bullet list (defensive). */
const needsInfoList = (v: unknown): string => {
  if (!Array.isArray(v)) return "";
  const lines: string[] = [];
  for (const entry of v) {
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    const label = typeof rec.item === "string" ? NEEDS_INFO_LABELS_TH[rec.item] : undefined;
    if (!label) continue;
    const note = typeof rec.note === "string" && rec.note ? ` — ${rec.note}` : "";
    lines.push(`• ${label}${note}`);
  }
  return lines.join("\n");
};

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
  BOOKING_CANCELLED_BY_GUEST: {
    priority: false,
    email: (p) => ({
      subject: `การจอง ${str(p.listingTitle)} ถูกยกเลิกโดยแขก`,
      body: `แขกได้ยกเลิกการจอง ${str(p.listingTitle)} วันที่ถูกปล่อยคืนแล้วและพร้อมรับการจองใหม่`,
    }),
    line: (p) => `แขกยกเลิกการจอง ${str(p.listingTitle)} — วันที่ว่างกลับมาแล้ว`,
  },
  BOOKING_CANCELLED_BY_HOST: {
    priority: true,
    email: (p) => ({
      subject: `การจอง ${str(p.listingTitle)} ถูกยกเลิกโดยโฮสต์ — คืนเงินเต็มจำนวน`,
      body: `ขออภัย โฮสต์ได้ยกเลิกการจอง ${str(p.listingTitle)} เราได้คืนเงินเต็มจำนวน ${satang(p.refundSatang)} ให้คุณแล้ว (อาจใช้เวลา 2–3 วันทำการ) ลองดูที่พักอื่นที่ว่างในช่วงเวลาเดียวกันได้เลย`,
    }),
    line: (p) => `⚠️ โฮสต์ยกเลิกการจอง ${str(p.listingTitle)} — คืนเงินเต็มจำนวน ${satang(p.refundSatang)} แล้ว`,
  },
  LISTING_APPROVED: {
    priority: true,
    email: (p) => ({
      subject: `ที่พักได้รับอนุมัติแล้ว — ${str(p.listingTitle)}`,
      body: `ยินดีด้วย! ที่พัก "${str(p.listingTitle)}" ผ่านการตรวจสอบและเผยแพร่แล้ว พร้อมรับการจองได้เลย`,
    }),
    line: (p) => `✅ ที่พัก "${str(p.listingTitle)}" ได้รับอนุมัติแล้ว — พร้อมรับการจอง`,
  },
  LISTING_NEEDS_INFO: {
    priority: true,
    email: (p) => ({
      subject: `ต้องแก้ไขข้อมูลก่อนอนุมัติ — ${str(p.listingTitle)}`,
      body: `ทีมงานขอข้อมูลเพิ่มเติมสำหรับ "${str(p.listingTitle)}" ก่อนอนุมัติ:\n${needsInfoList(p.items)}\n\nแก้ไขแต่ละรายการแล้วกดส่งตรวจสอบอีกครั้งได้ในแอป`,
    }),
    line: (p) => `⚠️ "${str(p.listingTitle)}" ต้องแก้ไขข้อมูลก่อนอนุมัติ — ดูรายการและส่งตรวจสอบใหม่ได้ในแอป`,
  },
  LISTING_REJECTED: {
    priority: true,
    email: (p) => ({
      subject: `ที่พักไม่ผ่านการอนุมัติ — ${str(p.listingTitle)}`,
      body: `ขออภัย ที่พัก "${str(p.listingTitle)}" ไม่ผ่านการตรวจสอบ\nเหตุผล: ${str(p.reason)}`,
    }),
    line: (p) => `❌ "${str(p.listingTitle)}" ไม่ผ่านการอนุมัติ — ${str(p.reason)}`,
  },
  REPORT_RECEIVED: {
    priority: true,
    email: (p) => ({
      subject: `รับเรื่องแล้ว — ${reportCategory(p.category)}`,
      body: `เราได้รับเรื่องที่คุณแจ้ง (${reportCategory(p.category)}) เกี่ยวกับ ${str(p.targetLabel)} แล้ว ทีมงานจะตรวจสอบและแจ้งผลให้ทราบ ติดตามสถานะได้ในแอป`,
    }),
    line: (p) => `📩 รับเรื่องแล้ว: ${reportCategory(p.category)} — ทีมงานกำลังตรวจสอบ ติดตามสถานะได้ในแอป`,
  },
  REPORT_RESOLVED: {
    priority: true,
    email: (p) => ({
      subject: `ผลการตรวจสอบเรื่องที่แจ้ง — ${reportCategory(p.category)}`,
      body: `ทีมงานตรวจสอบเรื่องที่คุณแจ้ง (${reportCategory(p.category)}) เรียบร้อยแล้ว\nผลการตัดสิน: ${str(p.reason)}`,
    }),
    line: (p) => `✅ ผลการตรวจสอบ (${reportCategory(p.category)}): ${str(p.reason)}`,
  },
  REPORT_DISMISSED: {
    priority: false,
    email: (p) => ({
      subject: `ปิดเรื่องที่แจ้ง — ${reportCategory(p.category)}`,
      body: `เรื่องที่คุณแจ้ง (${reportCategory(p.category)}) ถูกปิดแล้ว\nเหตุผล: ${str(p.reason)}`,
    }),
    line: (p) => `เรื่องที่แจ้ง (${reportCategory(p.category)}) ถูกปิดแล้ว — ${str(p.reason)}`,
  },
};

export function getTemplate(key: string): NotificationTemplate | undefined {
  return templates[key];
}
