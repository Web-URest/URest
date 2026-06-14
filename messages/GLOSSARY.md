# U-Rest domain glossary

**The single source of truth for domain vocabulary** (ADR-008 §2). UI copy, docs, and
marketing must use these exact terms — UI strings live in `th.json`/`en.json`, but the
*words* are fixed here so everyone agrees.

**State names are canonical** (PRODUCT_FLOWS.md §3): code identifiers, Prisma enums, and
UI pills must match the English identifier columns below verbatim. When a flow and this
file disagree, PRODUCT_FLOWS.md wins and this file is the bug.

Conventions: money = integer satang (1 baht = 100 satang); timestamps UTC, displayed in
`Asia/Bangkok`; dates in UI use CE years + Thai month names (no Buddhist-era).

---

## Roles

| Identifier | Thai | English | Meaning |
|---|---|---|---|
| Guest | ผู้เข้าพัก | Guest | Default role on signup. Searches, chats with น้องเรสต์, books, reviews. |
| Host | โฮสต์ | Host | A guest who completed a listing + KYC. Owns listings, calendar, payouts. |
| Admin | ทีมงาน | Admin | Internal staff. Verifies humans, moves money, judges disputes. Separate `/admin` login. |

One `User` account holds both Guest and Host modes — the UI **switches context** (sand
chrome = guest, ink chrome = host), it is never a separate login. Admin is a separate
account entirely (ADR-007/010).

## Brand & product terms

| Identifier | Thai | English | Meaning |
|---|---|---|---|
| น้องเรสต์ | น้องเรสต์ | "Nong Rest" | The AI concierge (Claude/Haiku). Read-only tools, never-guess, never handles payment (ADR-006). |
| escrow | เอสโครว์ / เงินถือไว้ | escrow | U-Rest holds 100% of the booking total from payment until the guest checks out. |
| Escrow strip | — | escrow strip | The brand UI component: `คุณชำระเงิน → U-Rest ถือเงินไว้ → โฮสต์ได้รับเงินหลังเช็คเอาท์`. |
| Trust line | — | trust line | `เงินของคุณอยู่กับ U-Rest จนกว่าจะเช็คเอาท์` — appears on every money-related screen. |
| Commission | ค่าบริการ | commission | **10% host-side**, on completed bookings only. Guest pays the listed price exactly. |
| เงินประกัน | เงินประกัน | (cash) damage deposit | Cash collected at check-in by the host — **never** through the platform in v1. |
| ที่บันทึกไว้ | ที่บันทึกไว้ | saved villas | The guest's ♡ list (`/saved`); flat, newest-first. Entity `SavedVilla`. |
| Booking code | — | booking code | Format `UR-YYMM-NNNN`, assigned at CONFIRMED (from `BookingCodeCounter`). |

## Verification ladder & host legality

| Identifier | Thai | English | Meaning |
|---|---|---|---|
| Phone OTP | ยืนยันเบอร์โทร | phone OTP | Anti-spam floor: required before sending booking requests/messages. |
| KYC | ยืนยันตัวตน | KYC | Thai ID + right-to-rent doc + selfie + bank account, admin-reviewed **per listing**. Required for a listing to go live. The Thai national ID *number* is never stored (ADR-010). |
| ถูกต้องตามกฎหมาย badge | ป้ายถูกต้องตามกฎหมาย | legality badge | **Optional** tier: host uploads a hotel license or non-hotel registration (≤8-room exemption). Earns a badge + ranking boost. Never required for approval. |
| In-app-only obligation | — | in-app-only obligation | Host T&Cs warrant bookings for listed dates are taken only through U-Rest (ADR-012). |

## Booking modes (a listing setting, not a state)

| Identifier | Thai | English | Meaning |
|---|---|---|---|
| Request mode | ส่งคำขอก่อน | request-to-book (default) | Guest requests → host accepts (≤12h) → guest pays (≤12h). |
| Instant mode | ⚡ จองทันที | instant book | Guest pays immediately (≤1h window), no host approval. Host opt-in with strike acknowledgment. |

## Booking states (canonical `BookingStatus` — 10)

| Identifier | Thai pill | English | Meaning |
|---|---|---|---|
| REQUESTED | รอโฮสต์ยืนยัน | requested | Request sent (request mode), no charge yet. |
| AWAITING_PAYMENT | รอชำระเงิน | awaiting payment | Accepted/instant — payment window open (12h request / 1h instant). |
| CONFIRMED | ยืนยันแล้ว | confirmed | Paid; dates hard-locked; escrow HELD; contact unmasked. |
| CHECKED_IN | เช็คอินแล้ว | checked in | Auto at check-in 15:00; issue-report window open through the stay. |
| DISPUTED | มีข้อพิพาท | disputed | Guest reported an issue during the stay (until checkout); payout FROZEN. |
| COMPLETED | เข้าพักแล้ว | completed | Auto at checkout 11:00; payout RELEASABLE; review window opens. |
| DECLINED | — | declined | Host declined the request. |
| EXPIRED | — | expired | Host silent 12h, or payment window lapsed. |
| CANCELLED_BY_GUEST | ยกเลิกแล้ว | cancelled (guest) | Guest cancelled; refund per cancellation tier. |
| CANCELLED_BY_HOST | ยกเลิกแล้ว | cancelled (host) | Host cancelled; guest 100% refund + host strike. |

## Payout / escrow states (separate from booking state)

| Identifier | Thai pill | English | Meaning |
|---|---|---|---|
| HELD | ถือไว้ใน escrow | held | Money received, held in escrow. |
| RELEASABLE | — | releasable | At checkout (COMPLETED), no open dispute — ready for the payout run. |
| PAID | โอนแล้ว | paid | Admin transferred the host's 90% (manual run, v1). |
| FROZEN | ระงับชั่วคราว | frozen | Dispute/report/admin hold — payout run skips it. |
| REVERSED | คืนเงินแล้ว | reversed | Money refunded to the guest. **Guest-facing label: REFUNDED.** |

> **REFUNDED vs CANCELLED — two different things.** `CANCELLED_BY_*` is a *booking* state
> (what happened to the booking). **REFUNDED** is the guest-facing label for the *payout*
> state `REVERSED` (where the money went). A cancelled booking shows its `CANCELLED_*`
> booking pill **and** a `คืนเงินแล้ว`/REFUNDED money pill. REFUNDED is **not** a
> `BookingStatus`.

## Cancellation tiers (host picks one per listing)

| Identifier | Thai | English |
|---|---|---|
| Flexible | ยืดหยุ่น | flexible |
| Moderate | ปานกลาง | moderate |
| Strict | เข้มงวด | strict |

## Listing states (canonical `ListingStatus`)

| Identifier | Thai pill | Meaning |
|---|---|---|
| DRAFT | — | Wizard in progress (autosaves). |
| PENDING_REVIEW | รอตรวจสอบ | Submitted; admin reviews ≤24h. |
| PUBLISHED | เผยแพร่แล้ว | Live and bookable. |
| NEEDS_INFO | ขอข้อมูลเพิ่ม | Admin requested itemized fixes. |
| REJECTED | ปฏิเสธ | Admin rejected (reason given). |
| UNLISTED | ซ่อนอยู่ | Host hid it, or a location/ownership edit forced re-review. |

## Pricing

| Identifier | Thai | Meaning |
|---|---|---|
| Pricing resolution | — | Per night: **holiday > season > base** (each layer weekday/weekend; holiday is one rate). |
| ซีซั่นราคา | ซีซั่นราคา | Host-defined named date ranges with their own rates. Overlaps rejected (DB constraint). |
| Holiday rate | วันหยุด | Applied on Thai public holidays + their eves (system `ThaiHoliday` calendar). |
| Extra-guest fee | ค่าผู้เข้าพักเพิ่ม | Per person per night above the included count. |

## Reporting & admin

| Identifier | Thai | English | Meaning |
|---|---|---|---|
| Dispute | แจ้งปัญหาที่พัก | dispute | Guest reports an issue during the stay (until checkout); freezes payout; full-refund promise applies. |
| Booking report | รายงานปัญหาการจอง | booking report | Any non-terminal booking; freezes payout if not yet PAID. |
| Listing report | รายงานที่พักนี้ | listing report | Anyone, from the listing page; flags the listing for admin review. |
| Reports queue | ศูนย์รับเรื่อง | reports queue | One admin intake for all reports (PRODUCT_FLOWS §5.6). |
| Unanswered question | คำถามที่ตอบไม่ได้ | unanswered question | Logged whenever น้องเรสต์ hits its refusal path → admin suggests a host FAQ (§5.7). |
| Host strike | — | strike | Penalty for HOST_CANCELLED / STALE_CALENDAR_DOUBLE_BOOKING; 3 → suspension. |
| ปิดเอง | ปิดเอง | self-block | Host calendar block for *legitimate* unavailability — not a "book elsewhere" affordance (ADR-012). |

---

*Adding or changing a term here is a docs change that touches UI copy and marketing —
keep this file and the canonical state machines in PRODUCT_FLOWS.md in lockstep.*
