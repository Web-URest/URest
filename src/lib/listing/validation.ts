/**
 * Zod schemas for the listing wizard (PRODUCT_FLOWS §4.1 steps ①–⑤).
 *
 * Shared by the client (inline field validation) and the server actions
 * (authoritative re-validation — never trust the client). Money arrives as
 * integer satang (the client converts host-typed baht at the edge via
 * `src/lib/money.ts`); these schemas reject anything that isn't whole satang.
 */

import { z } from "zod";
import {
  Amenity,
  BookingMode,
  CancellationTier,
  PartyPolicy,
} from "@prisma/client";

const satang = z
  .number()
  .int("ต้องเป็นจำนวนเต็มสตางค์")
  .nonnegative();

const positiveSatang = satang.refine((v) => v > 0, "ต้องมากกว่า 0");

/** "HH:MM" 24h, zone-free (matches the schema's string time columns). */
const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "รูปแบบเวลาไม่ถูกต้อง (HH:MM)");

// ── Step ① basics ────────────────────────────────────────────────────────────
export const step1Schema = z.object({
  regionId: z.string().min(1, "เลือกพื้นที่"),
  title: z.string().trim().min(1, "ใส่ชื่อที่พัก").max(120),
  description: z.string().trim().max(4000).default(""),
  address: z.string().trim().max(500).default(""),
  mapLat: z.number().min(-90).max(90).nullable().optional(),
  mapLng: z.number().min(-180).max(180).nullable().optional(),
});

// ── Step ③ details & amenities ───────────────────────────────────────────────
const poolDim = z.number().positive().max(99.99).nullable().optional();
export const step3Schema = z.object({
  bedrooms: z.number().int().min(1).max(50),
  beds: z.number().int().min(1).max(99),
  baths: z.number().int().min(1).max(50),
  maxGuests: z.number().int().min(1).max(99),
  poolLengthM: poolDim,
  poolWidthM: poolDim,
  poolDepthM: poolDim,
  amenities: z.array(z.nativeEnum(Amenity)).default([]),
});

// ── Step ④ house rules ───────────────────────────────────────────────────────
export const step4Schema = z.object({
  partyPolicy: z.nativeEnum(PartyPolicy),
  quietHoursStart: timeOfDay.nullable().optional(),
  quietHoursEnd: timeOfDay.nullable().optional(),
  cashDepositSatang: satang.default(0),
  checkInTime: timeOfDay.default("15:00"),
  checkOutTime: timeOfDay.default("11:00"),
});

// ── Step ⑤ pricing, seasons & booking mode ───────────────────────────────────
export const seasonInputSchema = z
  .object({
    nameTh: z.string().trim().min(1, "ใส่ชื่อซีซั่น"),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    weekdaySatang: positiveSatang,
    weekendSatang: positiveSatang,
  })
  .refine((s) => s.startDate.getTime() <= s.endDate.getTime(), {
    message: "วันเริ่มต้องไม่หลังวันสิ้นสุด",
    path: ["endDate"],
  });

export const step5Schema = z
  .object({
    baseWeekdaySatang: positiveSatang,
    baseWeekendSatang: positiveSatang,
    holidaySatang: positiveSatang.nullable().optional(),
    includedGuests: z.number().int().min(1).max(99),
    extraGuestFeeSatang: satang.default(0),
    cancellationTier: z.nativeEnum(CancellationTier),
    bookingMode: z.nativeEnum(BookingMode),
    /** Strike acknowledgment — mandatory for instant mode (PRODUCT_FLOWS §4.1). */
    instantAck: z.boolean().default(false),
    seasons: z.array(seasonInputSchema).default([]),
  })
  .refine(
    (s) => s.bookingMode !== BookingMode.INSTANT || s.instantAck === true,
    { message: "ต้องยอมรับเงื่อนไขปฏิทินก่อนเปิดจองทันที", path: ["instantAck"] },
  );

// ── Edit Villa: per-section saves (§4.4) ─────────────────────────────────────
/** Basics card (no re-review): title + description only. */
export const editBasicsSchema = z.object({
  title: z.string().trim().min(1, "ใส่ชื่อที่พัก").max(120),
  description: z.string().trim().max(4000).default(""),
});

/** Location card (re-review): address + map pin. */
export const editLocationSchema = z.object({
  address: z.string().trim().max(500).default(""),
  mapLat: z.number().min(-90).max(90).nullable().optional(),
  mapLng: z.number().min(-180).max(180).nullable().optional(),
});

// ── Edit Villa: FAQ entries (§4.1 FAQ, §4.4) + calendar blocks (§4.2) ─────────
export const faqEntrySchema = z.object({
  question: z.string().trim().min(1, "ใส่คำถาม").max(300),
  answer: z.string().trim().min(1, "ใส่คำตอบ").max(2000),
});

/** "YYYY-MM-DD" date-only (a calendar night is an Asia/Bangkok date). */
const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)");

export const calendarBlockSchema = z
  .object({
    startDate: ymd,
    endDate: ymd,
    note: z.string().trim().max(200).optional(),
  })
  .refine((b) => b.startDate <= b.endDate, {
    message: "วันเริ่มต้องไม่หลังวันสิ้นสุด",
    path: ["endDate"],
  });

export type FaqEntryInput = z.infer<typeof faqEntrySchema>;
export type CalendarBlockInput = z.infer<typeof calendarBlockSchema>;

export type Step1Input = z.infer<typeof step1Schema>;
export type Step3Input = z.infer<typeof step3Schema>;
export type Step4Input = z.infer<typeof step4Schema>;
export type Step5Input = z.infer<typeof step5Schema>;
export type SeasonInput = z.infer<typeof seasonInputSchema>;

export const stepSchemas = {
  1: step1Schema,
  3: step3Schema,
  4: step4Schema,
  5: step5Schema,
} as const;
