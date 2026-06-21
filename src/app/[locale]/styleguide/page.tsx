import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  StatusPill,
  type BookingStatus,
  type ListingStatus,
  type PayoutStatus,
} from "@/components/ui/StatusPill";
import { EscrowStrip } from "@/components/ui/EscrowStrip";
import { ReportStatusTrail } from "@/components/ui/ReportStatusTrail";
import { ReportForm } from "@/components/ui/ReportForm";
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
import { BookingResultCard } from "@/app/[locale]/(protected)/concierge/BookingResultCard";
import { Heart } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { TrustBadge } from "@/components/ui/TrustBadge";
import { AmenityChip } from "@/components/ui/AmenityChip";
import { SlaBadge } from "@/components/ui/SlaBadge";
import { CountdownChip } from "@/components/ui/CountdownChip";
import { Skeleton, VillaCardSkeleton, ListRowSkeleton, ReserveCardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { CategoryRail } from "@/components/ui/CategoryRail";
import { ReviewSummary } from "@/components/ui/ReviewSummary";
import { ReviewCard } from "@/components/ui/ReviewCard";
import { HostProfileCard } from "@/components/ui/HostProfileCard";
import { ChatBubble, TypingIndicator } from "@/components/ui/ChatBubble";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { PillSearchBar } from "@/components/ui/PillSearchBar";
import { StickyReserveCard } from "@/components/ui/StickyReserveCard";
import { DataTable, Td, Tr } from "@/components/ui/DataTable";
import { OverlayDemo } from "./overlay-demo";
import type { Quote } from "@/lib/pricing/quote";

/**
 * /styleguide — the live design-system catalog (ADR-013, docs/DESIGN_SYSTEM.md).
 * Dev-only: renders every component with all its states using the real tokens, fonts,
 * and i18n. Never shipped to users. Add new/changed components here (with all states)
 * before merging — this is where design review happens.
 */

/** No-op server action so the dev-only ReportForm can render in the styleguide. */
async function noopReportAction(): Promise<void> {
  "use server";
}

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

// v3 SEMANTIC tokens (the contract). Legacy aqua/jade/coral/gold/sand names are
// deprecated var() aliases — new code must use these.
const SWATCHES: { name: string; className: string }[] = [
  { name: "brand-50", className: "bg-brand-50" },
  { name: "brand-100", className: "bg-brand-100" },
  { name: "brand-500", className: "bg-brand-500" },
  { name: "brand-600", className: "bg-brand-600" },
  { name: "brand-700", className: "bg-brand-700" },
  { name: "trust-50", className: "bg-trust-50" },
  { name: "trust-300", className: "bg-trust-300" },
  { name: "trust-500", className: "bg-trust-500" },
  { name: "trust-600", className: "bg-trust-600" },
  { name: "trust-700", className: "bg-trust-700" },
  { name: "error-50", className: "bg-error-50" },
  { name: "error-500", className: "bg-error-500" },
  { name: "error-600", className: "bg-error-600" },
  { name: "pending-50", className: "bg-pending-50" },
  { name: "pending-400", className: "bg-pending-400" },
  { name: "pending-700", className: "bg-pending-700" },
  { name: "ink-900", className: "bg-ink-900" },
  { name: "ink-700", className: "bg-ink-700" },
  { name: "ink-500", className: "bg-ink-500" },
  { name: "surface-50", className: "bg-surface-50" },
  { name: "surface-100", className: "bg-surface-100" },
  { name: "border", className: "bg-border" },
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

      <Section title="ReportStatusTrail — received → in-review → decision (+ dismissed)">
        <div className="flex max-w-md flex-col gap-6">
          <ReportStatusTrail status="RECEIVED" />
          <ReportStatusTrail status="IN_REVIEW" />
          <ReportStatusTrail status="RESOLVED" />
          <ReportStatusTrail status="DISMISSED" />
        </div>
      </Section>

      <Section title="ReportForm (category + free text)">
        <div className="max-w-md">
          <ReportForm action={noopReportAction} />
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

      <Section title="Concierge booking result cards (#32)">
        <div className="flex max-w-sm flex-col gap-4">
          <BookingResultCard
            card={{ kind: "payment_qr", bookingId: "bk1", code: "UR-2608-0001", qrUrl: undefined, payUrl: "/trips/bk1/pay" }}
          />
          <BookingResultCard card={{ kind: "request_sent", bookingId: "bk2", code: "UR-2608-0002", tripUrl: "/trips/bk2" }} />
        </div>
      </Section>

      {/* ───────────── v3 "AirBnB skin" additions ───────────── */}

      <Section title="PillSearchBar (hero + compact)">
        <div className="flex flex-col gap-4">
          <PillSearchBar
            variant="hero"
            labels={{ where: "ที่ไหน", when: "เมื่อไหร่", who: "กี่คน", anywhere: "ทุกพื้นที่", anyDates: "เลือกวันที่", guestsUnit: "ท่าน", search: "ค้นหา" }}
            regions={[{ slug: "pattaya", label: "พัทยา" }, { slug: "huahin", label: "หัวหิน" }]}
            defaultRegion="pattaya"
          />
        </div>
      </Section>

      <Section title="CategoryRail (region rail, active = rose underline)">
        <CategoryRail
          items={[
            { key: "pattaya", label: "พัทยา" },
            { key: "huahin", label: "หัวหิน" },
            { key: "khaoyai", label: "เขาใหญ่" },
            { key: "chiangmai", label: "เชียงใหม่" },
          ]}
          activeKey="pattaya"
          hrefFor={(s) => `/search?region=${s}`}
        />
      </Section>

      <Section title="VillaCard — chrome: bare (grid) vs card">
        <div className="flex flex-wrap gap-6">
          <div className="w-[300px] max-w-full">
            <VillaCard villa={VILLAS[0]!} chrome="bare" />
          </div>
          <div className="w-[300px] max-w-full">
            <VillaCard villa={VILLAS[1]!} chrome="card" />
          </div>
        </div>
      </Section>

      <Section title="StickyReserveCard (rose request CTA + price/rating header)">
        <div className="max-w-[360px]">
          <StickyReserveCard
            listingId="demo"
            bookingMode="REQUEST"
            maxGuests={12}
            pricingConfig={{ baseWeekdaySatang: 1_290_000, baseWeekendSatang: 1_590_000, holidaySatang: 1_900_000, includedGuests: 8, extraGuestFeeSatang: 30_000 }}
            seasons={[]}
            holidayDates={[]}
            pricePerNightSatang={1_290_000}
            perNightLabel="/ คืน"
            avgRating={4.8}
            reviewCount={23}
          />
        </div>
      </Section>

      <Section title="ReviewSummary + ReviewCard">
        <div className="flex max-w-xl flex-col gap-4">
          <ReviewSummary
            overall={4.8}
            reviewsLabel="23 รีวิว"
            subScores={[
              { label: "ความสะอาด", value: 4.9 },
              { label: "ตรงปก", value: 4.7 },
              { label: "การตอบกลับ", value: 5 },
              { label: "ความคุ้มค่า", value: 4.6 },
            ]}
          />
          <div className="divide-y divide-border-subtle">
            <ReviewCard authorName="Ploy" dateLabel="มิ.ย. 2026" overall={5} text="วิลล่าสวยมาก สระใหญ่ โฮสต์ดูแลดี" verifiedLabel="ผู้เข้าพักจริง ✓" />
            <ReviewCard authorName="Ton" dateLabel="พ.ค. 2026" overall={4} text="ทำเลดี ใกล้หาด" />
          </div>
        </div>
      </Section>

      <Section title="HostProfileCard">
        <div className="max-w-md">
          <HostProfileCard
            name="คุณนภา"
            verifiedLabel="ยืนยันตัวตนแล้ว ✓"
            superhostLabel="Superhost"
            lines={["ตอบกลับใน ~1 ชม.", "เป็นโฮสต์ 3 ปี", "5 ที่พัก"]}
          />
        </div>
      </Section>

      <Section title="Avatar (image / initial · sm md lg)">
        <div className="flex items-center gap-3">
          <Avatar name="Aok" size="sm" />
          <Avatar name="Ploy" size="md" />
          <Avatar name="นภา" size="lg" />
          <Avatar name="ring" size="lg" ring />
        </div>
      </Section>

      <Section title="IconButton · TrustBadge · AmenityChip · SlaBadge · CountdownChip">
        <div className="flex flex-wrap items-center gap-3">
          <IconButton label="save"><Heart size={18} /></IconButton>
          <TrustBadge label="ยืนยันตัวตนแล้ว ✓" />
          <AmenityChip label="สระส่วนตัว" />
          <AmenityChip label="คาราโอเกะ" selected />
          <SlaBadge label="เกินกำหนด" variant="urgent" />
          <SlaBadge label="ใกล้ครบกำหนด" variant="warning" />
          <SlaBadge label="อุทธรณ์" variant="info" />
          <CountdownChip deadlineIso="2030-01-01T00:00:00Z" prefix="ตอบภายใน" expiredLabel="หมดเวลา" />
        </div>
      </Section>

      <Section title="AskAiButton (chip / inline / card)">
        <div className="flex max-w-xl flex-col items-start gap-4">
          <AskAiButton variant="chip" label="ถามน้องเรสต์เกี่ยวกับวิลล่านี้" />
          <AskAiButton variant="inline" label="ให้ AI ช่วยเลือก" />
          <AskAiButton variant="card" label="ให้ AI ช่วยหาวิลลาให้" sublabel="บอกความต้องการ เดี๋ยวน้องเรสต์หาให้" />
        </div>
      </Section>

      <Section title="ChatBubble + TypingIndicator">
        <div className="flex max-w-md flex-col gap-3">
          <ChatBubble role="assistant" content="สวัสดีค่ะ! อยากได้วิลล่าแบบไหนดีคะ" />
          <ChatBubble role="user" content="วิลล่า 10 คน ใกล้หาดจอมเทียน มีคาราโอเกะ" />
          <ChatBubble role="assistant" content="กำลังพิมพ์" isStreaming />
          <TypingIndicator />
        </div>
      </Section>

      <Section title="Skeletons (loading.tsx building blocks)">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <VillaCardSkeleton />
            <VillaCardSkeleton />
            <VillaCardSkeleton />
          </div>
          <ListRowSkeleton />
          <div className="max-w-[360px]"><ReserveCardSkeleton /></div>
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Section>

      <Section title="EmptyState">
        <EmptyState
          title="ยังไม่มีที่พักที่บันทึกไว้"
          body="เจอที่ถูกใจ กด ♡ เก็บไว้เปรียบเทียบได้เลย"
          primaryAction={<Button variant="primary">ค้นหาที่พัก</Button>}
        />
      </Section>

      <Section title="DataTable (admin/host queues)">
        <DataTable columns={[{ key: "a", header: "ที่พัก" }, { key: "b", header: "โฮสต์" }, { key: "c", header: "ยอด", align: "right" }]}>
          <Tr>
            <Td>บ้านริมเล จอมเทียน</Td>
            <Td>คุณนภา</Td>
            <Td align="right"><span className="tabular-nums">฿12,900</span></Td>
          </Tr>
          <Tr>
            <Td>พูลวิลล่าวิวเขา</Td>
            <Td>คุณตน</Td>
            <Td align="right"><span className="tabular-nums">฿8,900</span></Td>
          </Tr>
        </DataTable>
      </Section>

      <Section title="Overlays — Modal · BottomSheet · Toast · PhotoLightbox (interactive)">
        <OverlayDemo />
      </Section>
    </main>
  );
}
