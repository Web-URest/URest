import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  StatusPill,
  type BookingStatus,
  type ListingStatus,
  type PayoutStatus,
} from "@/components/ui/StatusPill";
import { EscrowStrip } from "@/components/ui/EscrowStrip";
import { Button } from "@/components/ui/Button";
import { VillaCard, type Villa } from "@/components/ui/VillaCard";
import { TileStrip } from "@/components/ui/TileStrip";
import { TopbarShell } from "@/components/ui/Topbar";
import { Footer } from "@/components/ui/Footer";
import { FormPrimitivesDemo } from "./form-primitives-demo";
import { DateRangeField } from "@/components/ui/DateRangeField";
import { GuestStepper } from "@/components/ui/GuestStepper";
import { PriceBreakdown } from "@/components/ui/PriceBreakdown";
import { FaqSection } from "@/components/ui/FaqSection";
import { PriceCalendar } from "@/components/ui/PriceCalendar";
import { StatCard } from "@/components/ui/StatCard";
import { ListingSwitcher } from "@/components/ui/ListingSwitcher";
import { CalendarGrid } from "@/components/ui/CalendarGrid";
import { SeasonEditor } from "@/components/ui/SeasonEditor";
import { BookingModeToggle } from "@/components/ui/BookingModeToggle";
import { StarRating } from "@/components/ui/StarRating";
import type { Quote } from "@/lib/pricing/quote";

/**
 * /styleguide — the live design-system catalog (ADR-013, docs/DESIGN_SYSTEM.md).
 * Dev-only: renders every component with all its states using the real tokens, fonts,
 * and i18n. Never shipped to users. Add new/changed components here (with all states)
 * before merging — this is where design review happens.
 */

const BOOKING_STATES: BookingStatus[] = [
  "REQUESTED",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "CHECKED_IN",
  "DISPUTED",
  "COMPLETED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED_BY_GUEST",
  "CANCELLED_BY_HOST",
];

const PAYOUT_STATES: PayoutStatus[] = [
  "HELD",
  "RELEASABLE",
  "PAID",
  "FROZEN",
  "REVERSED",
];

const LISTING_STATES: ListingStatus[] = [
  "DRAFT",
  "PENDING_REVIEW",
  "NEEDS_INFO",
  "PUBLISHED",
  "UNLISTED",
  "REJECTED",
];

const SWATCHES: { name: string; className: string }[] = [
  { name: "ink-900", className: "bg-ink-900" },
  { name: "ink-700", className: "bg-ink-700" },
  { name: "teal-600", className: "bg-teal-600" },
  { name: "aqua-500", className: "bg-aqua-500" },
  { name: "aqua-300", className: "bg-aqua-300" },
  { name: "aqua-100", className: "bg-aqua-100" },
  { name: "sand-50", className: "bg-sand-50" },
  { name: "sand-100", className: "bg-sand-100" },
  { name: "sand-300", className: "bg-sand-300" },
  { name: "coral-500", className: "bg-coral-500" },
  { name: "coral-600", className: "bg-coral-600" },
  { name: "jade-500", className: "bg-jade-500" },
  { name: "gold-400", className: "bg-gold-400" },
];

const VILLAS: Villa[] = [
  {
    name: "บ้านริมเล จอมเทียน",
    region: "พัทยา",
    sleeps: 12,
    bedrooms: 4,
    amenities: ["สระส่วนตัว", "คาราโอเกะ", "BBQ", "สัตว์เลี้ยงได้"],
    pricePerNightSatang: 1_290_000,
    weekendPriceSatang: 1_590_000,
    rating: 4.8,
    reviewCount: 23,
    verified: true,
  },
  {
    name: "พูลวิลล่าวิวเขา",
    region: "พัทยา",
    sleeps: 8,
    bedrooms: 3,
    amenities: ["สระส่วนตัว", "สไลเดอร์"],
    pricePerNightSatang: 890_000,
    saved: true,
    hueDeg: 40,
  },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-2xl text-ink-900">{title}</h2>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-12 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl text-ink-900">U-Rest design system</h1>
        <p className="text-ink-700">
          Live component catalog — dev only (ADR-013). Build UI from these; add new
          components here with all their states. See{" "}
          <code className="rounded bg-sand-100 px-1">docs/DESIGN_SYSTEM.md</code>.
        </p>
        <TileStrip className="mt-2 max-w-xs rounded-full" />
      </header>

      <Section title="Color tokens">
        <div className="flex flex-wrap gap-3">
          {SWATCHES.map((s) => (
            <div key={s.name} className="flex flex-col items-center gap-1">
              <div
                className={`h-14 w-14 rounded-input border border-line ${s.className}`}
              />
              <span className="text-xs text-ink-700">{s.name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">ส่งคำขอจอง</Button>
          <Button variant="money">ชำระเงิน</Button>
          <Button variant="teal">คุยกับโฮสต์</Button>
          <Button variant="ghost">ปฏิเสธ</Button>
          <Button variant="primary" disabled>
            ปิดใช้งาน
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="money" size="lg">
            ชำระเงินเลย (lg)
          </Button>
          <div className="w-64">
            <Button variant="primary" fullWidth>
              เต็มความกว้าง
            </Button>
          </div>
        </div>
      </Section>

      <Section title="StatusPill — booking states">
        <div className="flex flex-wrap gap-2">
          {BOOKING_STATES.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="StatusPill — payout / money states">
        <div className="flex flex-wrap gap-2">
          {PAYOUT_STATES.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="StatusPill — listing lifecycle states">
        <div className="flex flex-wrap gap-2">
          {LISTING_STATES.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="EscrowStrip — full (guest), step 1 → 3">
        <div className="flex flex-col gap-4">
          <EscrowStrip step={1} audience="guest" />
          <EscrowStrip step={2} audience="guest" />
          <EscrowStrip step={3} audience="guest" />
        </div>
      </Section>

      <Section title="EscrowStrip — full (host) + compact">
        <div className="flex flex-col gap-4">
          <EscrowStrip step={2} audience="host" />
          <div className="flex flex-col gap-2">
            <EscrowStrip step={1} variant="compact" />
            <EscrowStrip step={2} variant="compact" />
            <EscrowStrip step={3} variant="compact" audience="host" />
          </div>
        </div>
      </Section>

      <Section title="VillaCard (390px mobile frame)">
        <div className="flex flex-wrap gap-6">
          {VILLAS.map((v) => (
            <div key={v.name} className="w-[390px] max-w-full">
              <VillaCard villa={v} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Topbar — logged-out">
        <div className="-mx-6 border border-line">
          <TopbarShell user={null} />
        </div>
      </Section>

      <Section title="Topbar — logged-in (avatar fallback)">
        <div className="-mx-6 border border-line">
          <TopbarShell user={{ name: "Chavaphon", image: null }} />
        </div>
      </Section>

      <Section title="Footer">
        <div className="-mx-6">
          <Footer />
        </div>
      </Section>

      <Section title="Form primitives (listing wizard)">
        <FormPrimitivesDemo />
      </Section>

      <Section title="DateRangeField">
        <div className="max-w-sm">
          <DateRangeField
            checkIn=""
            checkOut=""
            onCheckInChange={() => {}}
            onCheckOutChange={() => {}}
          />
        </div>
      </Section>

      <Section title="GuestStepper">
        <div className="max-w-xs">
          <GuestStepper value={4} max={12} onChange={() => {}} />
        </div>
      </Section>

      <Section title="PriceBreakdown">
        <div className="max-w-sm">
          <PriceBreakdown
            quote={
              {
                nights: [
                  { date: "2026-07-04", rule: "BASE", dayKind: "WEEKDAY", rateSatang: 1_290_000 },
                  { date: "2026-07-05", rule: "BASE", dayKind: "WEEKEND", rateSatang: 1_590_000 },
                  { date: "2026-07-06", rule: "SEASON", dayKind: "WEEKDAY", rateSatang: 1_490_000, seasonNameTh: "ไฮซีซั่น" },
                ],
                nightsSubtotalSatang: 4_370_000,
                extraGuestFeeSatang: 90_000,
                totalSatang: 4_460_000,
                commissionSatang: 446_000,
                hostEarningsSatang: 4_014_000,
                nightCount: 3,
                guests: 10,
              } satisfies Quote
            }
          />
        </div>
      </Section>

      <Section title="FaqSection">
        <div className="max-w-lg">
          <FaqSection
            entries={[
              { id: "1", question: "สระเหมาะกับเด็กเล็กไหม", answer: "สระลึก 1.5 เมตรตลอดสระ ไม่มีโซนเด็ก" },
              { id: "2", question: "จอดรถได้กี่คัน", answer: "จอดได้ 3 คันค่ะ" },
            ]}
          />
        </div>
      </Section>

      <Section title="PriceCalendar">
        <div className="max-w-2xl">
          <PriceCalendar
            calendarBlocks={[
              {
                startDate: new Date("2026-07-10"),
                endDate: new Date("2026-07-15"),
              },
            ]}
          />
        </div>
      </Section>

      <Section title="StatCard — host KPIs (value + zero-state)">
        <div className="grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="รายรับเดือนนี้" value="฿0" />
          <StatCard label="การจอง" value={null} hint="พร้อมใช้งานเฟส 3" />
          <StatCard label="อัตราตอบรับ" value={null} hint="พร้อมใช้งานเฟส 3" />
          <StatCard label="เรตติ้ง" value={null} hint="พร้อมใช้งานเฟส 3" />
        </div>
      </Section>

      <Section title="ListingSwitcher (one calendar per villa)">
        <ListingSwitcher
          listings={[
            { id: "a", title: "บ้านพูลวิลล่าทดสอบ จอมเทียน" },
            { id: "b", title: "บ้านริมสวน นาเกลือ" },
          ]}
          selectedId="a"
          onSelect={() => {}}
        />
      </Section>

      <Section title="CalendarGrid — host (ว่าง / ปิดเอง, tap to toggle)">
        <div className="max-w-2xl">
          <CalendarGrid
            blocks={[
              {
                id: "blk1",
                startDate: new Date("2026-07-10"),
                endDate: new Date("2026-07-12"),
              },
            ]}
            onToggleDate={() => {}}
          />
        </div>
      </Section>

      <Section title="SeasonEditor (wizard ⑤ + Edit Villa)">
        <div className="max-w-2xl">
          <SeasonEditor
            seasons={[
              {
                nameTh: "ไฮซีซั่น",
                startDate: "2026-11-01",
                endDate: "2027-02-28",
                weekdayBaht: 15900,
                weekendBaht: 18900,
              },
            ]}
            onChange={() => {}}
          />
        </div>
      </Section>

      <Section title="BookingModeToggle (request / instant + ack)">
        <div className="flex max-w-2xl flex-col gap-6">
          <BookingModeToggle
            mode="REQUEST"
            onModeChange={() => {}}
            ack={false}
            onAckChange={() => {}}
          />
          <BookingModeToggle
            mode="INSTANT"
            onModeChange={() => {}}
            ack={false}
            onAckChange={() => {}}
          />
        </div>
      </Section>

      <Section title="StarRating — review display (fractional fill + count)">
        <div className="flex flex-col gap-2">
          <StarRating value={4.8} count={23} />
          <StarRating value={3.5} count={4} />
          <StarRating value={5} showValue={false} />
          <StarRating value={0} count={0} />
        </div>
      </Section>
    </main>
  );
}
