# U-Rest — UX/UI Design Specification (v1)

> **Design source of truth (2026-06-14, ADR-013):** the **design tokens in §3** —
> implemented in `src/app/globals.css` `@theme`, the single source of truth, no further
> re-derivation pending — **plus the React component library** in `src/components/ui/`,
> previewed live at the dev-only **`/styleguide`** route. Build new UI *from those
> components*; if one is missing, add it to the library + `/styleguide` rather than
> inlining a one-off (`docs/DESIGN_SYSTEM.md` is the contribution contract). Earlier
> design-exploration artifacts — the original static mockups and the later single-file
> HTML prototype — are **retired** (recoverable from git history; mockups at commit
> `0b1b620`). §9 below preserves that audit's verdict and its still-open build-checklist
> gaps.

Companion: the live component catalog at **`/styleguide`** (run `pnpm dev`).
This document is the contract for all UI implementation in Phases 1–5. If code and spec disagree, fix one of them.

---

## 1. Brand

| | |
|---|---|
| Name | **U-Rest** (ยูเรสต์) |
| Tagline (TH) | พักให้เต็มที่ จองให้มั่นใจ — "Rest fully, book with confidence" |
| Trust line | เงินของคุณอยู่กับ U-Rest จนกว่าจะเช็คเอาท์ — appears on every money-related screen |
| Personality | A modern Thai resort: warm, calm, generous — but precise and serious wherever money appears |
| Anti-goal | Must NOT look like a Facebook villa page or corporate-bank sterile. (v3: the "generic Airbnb clone" anti-goal is REMOVED — see ADR-013 v3 amendment.) |

> ⚠️ **Identity v3 "AirBnB skin" (2026-06-21 — see ADR-013 amendment) supersedes the design concept below.**
> Current concept: **AirBnB-grade trust marketplace — rose primary + retained green escrow-trust.** Brand =
> rose `#ff385c`; trust (escrow-safe/verified/paid) = green `#0b7a5b`; error = red; pending/ratings = amber;
> pay/money action = ink. Authoritative tokens live in `src/app/globals.css` `@theme` (semantic names
> `brand/trust/error/pending/ink/surface/border`; legacy names are deprecated aliases). Back-of-house
> (host/admin) is now light, not ink. Failure criterion: "unstyled Tailwind starter, or violates the
> rose-primary / green-trust split."

**Design concept (v1, historical): "Modern Thai poolside."** Sand-colored pages (paper = sand), deep pool-water ink for headers and footers, aqua for actions, sunset coral reserved almost exclusively for payment moments. Pool-tile checker strips and a ripple squiggle are the recurring motifs. Everything money-related is visually "held" by the escrow strip component.

## 2. Design principles

1. **Trust is visible, not claimed.** Verification badges, the escrow strip, and review counts appear at every decision point. Never use trust language without a UI element backing it.
2. **Thai-first.** All copy designed in Thai first; English is the translation. Numerals: Arabic digits. Currency: `฿12,900` (no decimals). Dates: `ศ. 19 มิ.ย.` short form.
3. **Mobile-first.** Every screen is designed at 390px and then adapted up. Primary actions live in a sticky bottom bar on mobile.
4. **One money action per screen.** Solid **ink** (near-black) marks THE money action (pay, payout); if a screen has two, one is wrong. (v2 Clean & Modern — was coral; see the §3 amendment.)
5. **States are first-class.** A booking has 10 states; each has a defined pill color and copy. Never render a state as plain text.

## 3. Design tokens

Implemented in `src/app/globals.css` under `@theme`. Use these names in the app (Tailwind utilities / CSS variables).

> ⚠️ **Superseded by Identity v2 "Clean & Modern" (2026-06-21 — see the ADR-013 amendment).**
> The palette, type, and motifs in this section describe the **retired v1 "Thai poolside"** identity.
> **Authoritative current values live in `src/app/globals.css` `@theme`** — token *names* were kept,
> *values* remapped. Role map: `aqua`/`jade`/`teal` → **emerald** (primary / verified / success),
> `coral` → **red** (cancel / frozen / error), `gold` → **amber** (pending / star ratings),
> `sand` → **white / neutral grays**. Fonts: **Prompt** (display) + **Anuphan** (body), sans-only.

### Color

| Token | Hex | Use |
|---|---|---|
| `--ink-900` | `#07272B` | Deep pool night: header/footer bg, primary text |
| `--ink-700` | `#0E3A40` | Secondary dark surfaces, hover on ink |
| `--teal-600` | `#0E7C82` | Solid buttons w/ white text, links |
| `--aqua-500` | `#14A8AE` | Primary action bg (with ink text), active states, focus rings |
| `--aqua-300` | `#7FD6D9` | Decorative ripples, charts |
| `--aqua-100` | `#DFF4F4` | Selected/info backgrounds |
| `--sand-50` | `#FBF7EE` | Page background (never pure white pages) |
| `--sand-100` | `#F4EDDD` | Alternate section bg, input bg |
| `--sand-300` | `#E5D9BF` | Strong hairlines, disabled |
| `--line` | `#E7E0CF` | Default hairline borders |
| `--coral-500` | `#FF6B4A` | THE money action, urgent countdowns |
| `--coral-600` | `#E8533A` | Coral hover |
| `--jade-500` | `#1E9E6A` | Verified, success, "confirmed" |
| `--gold-400` | `#E9B949` | Star ratings only |
| `--white` | `#FFFFFF` | Cards on sand |

Status pill mapping (booking state → bg/text):
`REQUESTED` sand-100/ink · `AWAITING_PAYMENT` coral-500/white · `CONFIRMED` aqua-100/teal-600 · `CHECKED_IN` aqua-500/ink · `DISPUTED` gold tint `#FBF1D9`/`#8A6A1F` + ⚠ (distinct from listing `PENDING_REVIEW` by the marker + booking context) · `COMPLETED` jade tint `#E2F4EB`/jade · `DECLINED`,`EXPIRED` sand-300/ink-60% · `CANCELLED_*` `#FBE9E4`/coral-600 · `PENDING_REVIEW`,`NEEDS_INFO` (listings) gold tint `#FBF1D9`/`#8A6A1F`.

Payout-state pills: `HELD` ("ถือไว้ใน escrow") = CONFIRMED style · `PAID` ("โอนแล้ว") = COMPLETED style · `FROZEN` ("ระงับชั่วคราว") = CANCELLED style + 🔒 · `REVERSED` ("คืนเงินแล้ว", guest-facing label **REFUNDED**) = CANCELLED style. **REFUNDED is the money/payout label for the `REVERSED` escrow state — it is NOT a `BookingStatus`. A cancelled booking shows its `CANCELLED_*` booking pill *and* this money pill (two pill families: booking state vs. money state).**
Booking-mode badge (a listing setting, not a state): `⚡ จองทันที` aqua-100/teal-600 · `ส่งคำขอก่อน` sand-100/ink-60%. Shown on listing pages, villa cards, and host listing rows.

### Typography

Google Fonts: **Chonburi** (display), **Anuphan** 400/500/600/700 (everything else), **Sriracha** (rare handwritten accents — max one per page).

| Role | Font | Size (mobile → desktop) |
|---|---|---|
| Display / hero | Chonburi | clamp(2rem → 3.5rem), line-height 1.25 |
| Page title | Chonburi | clamp(1.5rem → 2.25rem) |
| Section heading | Anuphan 700 | 1.125–1.375rem, with `.ripple` underline on landing/marketing surfaces only |
| Body | Anuphan 400 | 0.9375rem / 1.65 |
| UI labels, buttons | Anuphan 600 | 0.875rem |
| Caption/meta | Anuphan 500 | 0.8125rem, ink 60% |
| Big money | Chonburi | 1.5–2rem — prices in summaries use Chonburi; prices in lists use Anuphan 700 |

Thai line-height needs +10% vs Latin defaults; never below 1.5 for body. `font-family: 'Anuphan','Noto Sans Thai',sans-serif`.

### Shape, depth, motion

- Radius: cards `16px`, inputs `12px`, buttons pill `999px`, photos `14px`, status pills `999px`.
- Shadows (warm, never gray): cards `0 1px 2px rgba(7,39,43,.05)`, raised `0 14px 40px rgba(7,39,43,.10)`. Hairline borders preferred over shadow for separation on sand.
- Motion: 160ms ease-out for hover/press; page-load = single staggered fade-up (60ms steps) on landing surfaces only; dashboards load instantly with no entrance animation. Respect `prefers-reduced-motion`.

### Signature motifs

1. **Tile strip** (`.tile-strip`) — 8px-tall checkered aqua pool-tile band. Used: top of footer, under hero, top edge of payment cards. Never more than 2 per screen.
2. **Ripple underline** (`.ripple`) — aqua SVG squiggle under marketing headings.
3. **Escrow strip** (`.escrow`) — the brand component. 3-step horizontal tracker: `คุณชำระเงิน → U-Rest ถือเงินไว้ → โฮสต์ได้รับเงินหลังเช็คเอาท์`, current step highlighted. Appears on: checkout, payment, trip detail, host payout screens, listing page (compact variant).
4. **Photo placeholders** — until real photos: layered aqua/sand gradient "caustics" tiles, varying hue per villa. Never gray boxes.

## 4. Layout system

- Max content width `1120px`; gutter 16px mobile / 24px desktop.
- **Topbar** (sand, hairline bottom): logo `U·Rest` (Chonburi, the `·` in aqua) · center nav (desktop): ค้นหา / AI ช่วยหา / เป็นโฮสต์ · right: language pill `TH|EN`, avatar. Mobile: logo + hamburger; primary search lives in page, not topbar.
- **Footer** (ink-900, sand text): tile-strip on top edge, 3 columns + PDPA/ToS line.
- Host & Admin areas swap the sand topbar for an ink-900 one (instant context cue: "back of house").
- Sticky mobile action bar (`.actionbar`): white, hairline top, contains price + primary CTA. Used on listing, checkout, wizard.

## 5. Pages (per-page spec — live reference: the `/styleguide` catalog + `src/components/ui/`)

### 5.1 Home / Search
- **Hero** on ink-900 with caustic aqua radial glows + grain. Chonburi headline: `พูลวิลล่าที่ใช่ จองแล้วเงินไม่หาย` + trust subline. Staggered fade-up.
- **Search card** overlapping hero bottom (white, raised): ที่ไหน (region select) / เช็คอิน–เช็คเอาท์ (dates) / กี่คน (guests) / aqua search button. Stacks vertically on mobile.
- **AI concierge entry**: full-width banner card under search — chat-bubble icon, `บอกความต้องการ เดี๋ยว AI หาให้` + example chips (`"วิลล่า 10 คน ใกล้หาดจอมเทียน มีคาราโอเกะ"`). Tapping opens the concierge chat. This is a primary entry, not a corner widget.
- **Trust row**: 3 compact value props (โฮสต์ยืนยันตัวตน / เงินถือไว้จนเช็คเอาท์ / รีวิวจากผู้เข้าพักจริง) each with icon — rendered as the escrow story, not generic feature bullets.
- **Region rail**: horizontal scroll cards (พัทยา, หัวหิน, เขาใหญ่, เชียงใหม่, กาญจนบุรี, ภูเก็ต) with villa counts.
- **Featured villas grid**: villa cards (see component below).

**Villa card**: photo (3:2, radius 14) with ♡ save + `โฮสต์ยืนยันแล้ว ✓` jade badge overlay → name (Anuphan 700) → meta line (region · sleeps N · bedrooms) → amenity chips (max 3 + "+N") → bottom row: `฿12,900 / คืน` + `ศ–ส ฿15,900` weekend price hint + ★ 4.8 (23).

### 5.2 Search results
- Sticky sub-header: editable summary (region·dates·guests) + filter chips (ราคา, จำนวนคน, ⚡ จองทันที, สระส่วนตัว, คาราโอเกะ, BBQ, สัตว์เลี้ยง) + sort.
- Desktop: results list (cards, 2-col) left + sticky map right (40%). Mobile: list only + floating `แผนที่` pill toggling full-screen map. Map pins = price pills (aqua selected).
- Result count + "AI ช่วยเลือกจากผลลัพธ์นี้" link into concierge with filters carried over.
- Empty state: ripple illustration + loosen-filters suggestions + concierge CTA.

### 5.3 Villa detail
- Gallery: mobile swipe carousel (dots), desktop 1 large + 4 grid + `ดูรูปทั้งหมด (24)`.
- Title block: name, region link, ★ rating · review count, jade verified badge, booking-mode badge.
- **Booking card** (desktop right sticky / mobile sticky actionbar + section): date fields, guest stepper, price breakdown per night (each line labeled by pricing rule: ธรรมดา / ศ–ส / ไฮซีซั่น / วันหยุด), total. CTA depends on booking mode: request → `ส่งคำขอจอง` (aqua) + caption `ยังไม่ต้องจ่ายตอนนี้ — จ่ายหลังโฮสต์ยืนยัน`; instant → `⚡ จองทันที` (aqua) + caption `ชำระเงินทันที — ยืนยันการจองเลย ไม่ต้องรอโฮสต์`. Compact escrow strip at card bottom.
- **"ถามน้องเรสต์เกี่ยวกับที่พักนี้"** entry (chip-style button near amenities) → opens concierge scoped to this villa.
- Footer of page: low-key `รายงานที่พักนี้` text link → ReportModal (category + detail + photos).
- Sections: host snippet (avatar, ตอบกลับใน ~1 ชม., listings count) → amenities grid (pool dimensions called out — `สระ 8×4 ม. ลึก 1.5 ม.`) → **กฎที่พัก & ปาร์ตี้** (party policy, quiet hours, max guests, damage deposit `฿3,000 เงินสดที่เช็คอิน` — explicit card, this market's #1 dispute source) → availability calendar (2 months, blocked dates sand-300 struck) → **ที่เที่ยวใกล้ ๆ** (attraction cards w/ distance — feeds from AI cache later) → reviews (rating summary bars + cards, `ผู้เข้าพักจริง ✓` on each) → cancellation policy tier card.

### 5.4 Booking flows (both modes; all payment/timer states)
Two flows by listing booking mode:
- **Request mode** — stepper `1 ส่งคำขอ → 2 โฮสต์ยืนยัน → 3 ชำระเงิน → 4 จองสำเร็จ` (states below).
- **⚡ Instant mode** — stepper `1 ยืนยันและชำระเงิน → 2 จองสำเร็จ`: state-1 layout merged with the payment UI (trip summary + breakdown + rules checkbox + PromptPay/card tabs on one screen, 1h countdown instead of 12h), then the same confirmed screen.
- **State 1 — request**: trip summary card (villa thumb, dates, guests) + price breakdown (each night listed `ศ. 19 มิ.ย. ฿15,900`…, total in Chonburi) + contact fields + house-rules checkbox + `ส่งคำขอจอง`. Caption: no charge yet.
- **State 2 — awaiting host**: status card with 12h countdown ring, explainer timeline, `แจ้งเตือนผ่าน LINE` toggle, cancel-request link. Calm screen — aqua, no coral.
- **State 3 — payment**: THE coral screen. 12h payment countdown banner (coral). Tabs: **PromptPay QR** (QR card with tile-strip top edge, amount in Chonburi, `เปิดแอปธนาคารแล้วสแกน`) | **บัตรเครดิต/เดบิต** (form). Full escrow strip prominent. Pay button coral.
- **State 4 — confirmed**: jade check splash, booking code `UR-2406-8842`, detail summary, `เพิ่มลงปฏิทิน` / `คุยกับโฮสต์` / `ดูทริปของฉัน`. Compact escrow strip showing step 2 active ("U-Rest ถือเงินไว้").

### 5.5 Guest trips
- Tabs: กำลังจะถึง / รอดำเนินการ / ที่ผ่านมา.
- Trip cards: photo, villa, dates, status pill, contextual action (`ชำระภายใน 8:42 ชม.` coral for AWAITING_PAYMENT, `เขียนรีวิว` for COMPLETED, `ดูเส้นทาง` for CONFIRMED). Pending requests show countdown to host deadline.
- Each card expands to mini escrow strip showing where the money currently is.

### 5.6 AI chat ("น้องเรสต์")
- Full-height chat, ink header with aqua status dot `น้องเรสต์ — AI ผู้ช่วยหาที่พัก`.
- Bubbles: user sand-100 right; AI white left with small ripple avatar.
- **Tool results render as rich cards in-stream**: villa result carousel (mini villa cards with `ว่าง ✓` availability tag), attraction list card, and the **booking draft card** — villa + dates + guests + total + `ตรวจสอบและชำระเงิน →` button that deep-links to checkout. Draft card carries caption: `น้องเรสต์จองให้ไม่ได้ — คุณกดยืนยันเองเสมอ` (AI acts, human pays, stated in-product).
- Quick-reply chips after AI turns. Input bar with suggestion placeholder. Typing indicator = three ripple dots.
- First-open state: greeting + 3 example prompts as tappable cards.

### 5.7 Host dashboard (ink "back of house" chrome)
- Sidebar (desktop) / bottom tabs (mobile): ภาพรวม · คำขอจอง · ปฏิทิน · ที่พักของฉัน · รายรับ.
- **ภาพรวม**: stat cards (เดือนนี้: รายรับ, การจอง, อัตราตอบรับ, เรตติ้ง) + actionable inbox preview.
- **คำขอจอง**: request rows with guest, dates, party-size, total, countdown chip `ตอบภายใน 9:12 ชม.`, accept (aqua) / decline (ghost). Accept → confirm modal stating guest then has 12h to pay.
- **ปฏิทิน**: **villa switcher chips at top — one calendar per villa, never merged**; 2-month grid; states: ว่าง (white) / จองแล้ว (aqua, guest name) / ปิดเอง (sand-300 diagonal). Tap-drag to block dates — the tool that prevents Facebook double-bookings; banner reminds host to block externally-booked dates (stronger copy when the villa is ⚡ instant).
- **รายรับ**: payout ledger (date, booking code, gross, `ค่าบริการ 10%`, net, status: ถือไว้ใน escrow / โอนแล้ว / 🔒 ระงับชั่วคราว with reason tooltip) + escrow strip in host orientation (`ผู้เข้าพักชำระแล้ว → U-Rest ถือไว้ → โอนให้คุณหลังเช็คเอาท์`).

### 5.8 Listing wizard
- 6 steps, progress dots + save-draft: ① ข้อมูลพื้นฐาน (type, region, address pin) ② รูปภาพ (drag-drop grid, min 5, cover star) ③ รายละเอียด & สิ่งอำนวยความสะดวก (amenity checkboxes incl. pool size fields) ④ กฎที่พัก (party policy radio, quiet hours, deposit amount) ⑤ ราคา & โหมดการจอง ⑥ ยืนยันตัวตน (Thai ID upload + right-to-rent doc + selfie).
- **Step ⑤** = pricing layers + booking mode: base weekday/weekend inputs → **SeasonEditor** (named date-range rows, each with own weekday/weekend rates, `+ เพิ่มซีซั่น`, overlapping ranges rejected inline) → holiday rate (system Thai-holiday calendar note) → extra-guest fee → earnings preview after 10% fee → **BookingModeToggle** (ส่งคำขอก่อน default / ⚡ จองทันที gated by acknowledgment checkbox about calendar accuracy + strike consequence).
- Final screen: `ส่งให้ทีมงานตรวจสอบ` → PENDING_REVIEW state card explaining ~24h review (the trust gate, framed as a feature: `ทุกที่พักผ่านการตรวจสอบ เพื่อให้ผู้เข้าพักมั่นใจ`).
- Step ⑤ ราคา (seasonal pricing) is the most novel and matches the locked pricing model.

### 5.9 Admin console (dense, ink chrome, desktop-first; Anuphan only, no display font)
- Queue table: listing, host, region, KYC docs status, submitted-at, SLA chip (>24h = coral).
- Review drawer: photos strip, details, ID doc viewer placeholder, right-to-rent doc, checklist (ID ↔ name match, docs readable, photos real, address coherent) → อนุมัติ (jade) / **ขอข้อมูลเพิ่ม (opens itemized checklist picker — admin ticks exactly which docs/details are required + per-item note; host receives a to-do list)** / ปฏิเสธ (with reason templates).
- Nav tabs: ตรวจสอบที่พัก · โอนเงินโฮสต์ (due list with 🔒 hold action per booking + freeze-all-host-payouts) · ข้อพิพาท · **รายงาน (reports queue: category, target, money-at-risk flag, triage actions)** · ผู้ใช้.

### 5.10 Edit Villa page (ink chrome)
- Header: villa name + live status pill (PUBLISHED / PENDING_REVIEW / UNLISTED) — status changes from edits are visible immediately.
- Section-per-card layout mirroring wizard steps, each with its own บันทึก: ข้อมูลพื้นฐาน · ตำแหน่งที่ตั้ง (⚠ warning banner: editing unlists until re-review) · รูปภาพ · สิ่งอำนวยความสะดวก · กฎที่พัก · ราคา & ซีซั่น (SeasonEditor) · โหมดการจอง (BookingModeToggle) · เอกสาร & บัญชี (⚠ re-review).
- Sections that trigger re-review carry a gold `ต้องตรวจสอบใหม่` tag on the card header; operational sections save instantly with a jade toast.

### 5.11 `/saved` — ที่บันทึกไว้ (decision 2026-06-12 — build in Phase 2, lowest-novelty page in the product)
- Standard villa-card grid (same component as §5.2 results, no map), newest-saved first, page title `ที่บันทึกไว้` + count.
- **♡ states**: unfilled outline (default) → **filled coral-500** when saved; optimistic toggle with a brief scale "pop" micro-interaction. Unsave on this page un-fills in place + jade undo toast (`เลิกบันทึกแล้ว · เลิกทำ`); card removed on next visit, not yanked mid-scroll.
- **Empty state**: ripple illustration (reuse §5.2 empty pattern), `ยังไม่มีที่พักที่บันทึกไว้` + line `เจอที่ถูกใจ กด ♡ เก็บไว้เปรียบเทียบได้เลย` + aqua `ค้นหาที่พัก` CTA + concierge chip.
- **Login bottom-sheet** (fires on logged-out ♡ tap anywhere): `เข้าสู่ระบบเพื่อบันทึกที่พัก` + login buttons (email/password · Google · Facebook · LINE, ADR-007) + one trust line (`บันทึกไว้ดูได้ทุกอุปกรณ์`); after login the pending save completes automatically and the sheet closes with the heart filling.
- **Nav**: ♡ icon in the header (guest chrome) linking here; no badge count (save counts parked in v2).

## 6. Component inventory (build once in Phase 1+ as React components)

`Topbar` `Footer` `VillaCard` `StatusPill` `EscrowStrip(variant: full|compact, step, audience: guest|host)` `PriceBreakdown` `DateRangeField` `GuestStepper` `AmenityChip` `RatingStars` `ReviewCard` `AttractionCard` `CountdownChip` `FlowStepper` `CalendarGrid(mode: guest|host)` `ChatBubble` `ToolResultCard(villa|attractions|draft)` `StatCard` `LedgerTable` `WizardShell` `UploadGrid` `AdminQueueTable` `TrustBadge` `TileStrip` `RippleHeading` `ActionBar` `SeasonEditor` `BookingModeToggle(with acknowledgment)` `ListingSwitcher` `ReportModal(category, text, photos)` `HoldBadge(🔒 + reason)` `NeedsInfoChecklist(admin picker + host to-do)`

## 7. Accessibility & i18n

- WCAG AA contrast on all text. (v2 Clean & Modern: the emerald accent `aqua-500` is dark, so it carries **white** text — never dark ink; gold/amber is decorative or large-text only.)
- Focus visible: 2px aqua ring, 2px offset, everywhere.
- Touch targets ≥ 44px; countdowns also render absolute time (`ภายใน 21:30 น.`) for clarity.
- All state pills carry text, never color alone.
- `lang="th"` default; every string through i18n keys from day one (`next-intl`); EN is secondary locale. Buddhist-era years are NOT used in UI (use CE, Thai month names).

## 8. Out of scope for v1 design

Dark mode · native-app patterns · email/LINE message templates (Phase 3) · marketing/landing pages beyond home · English locale designs (structure supports it; copy TH only).

## 9. Design audit (2026-06-12, historical) — verdict + build checklist

The retired single-file HTML prototype (`design/standalone/urest-standalone.html` — now removed; see the header note + ADR-013) was audited page-by-page, all three roles, against PRODUCT_FLOWS/PRD. **Verdict at the time: ~90% aligned, frequently word-for-word** (timers, escrow strips, NEEDS_INFO checklist, payout reconciliation, dispute mechanics, reports queue, all 10 booking states). The gaps below remain **requirements for the build** — implement them in `src/components/ui/` + the page routes; this section is kept as the historical gap list.

**A. Login & admin vs. the artifact** (A1 is now ALIGNED after the 2026-06-14 multi-provider reversal; only A2 remains do-NOT-copy):
1. Login = email/password + Google/Apple/LINE. **UPDATED 2026-06-14 — ADR-007 reversed to multi-provider: build email/password + Google + Facebook + LINE. Use Facebook in place of Apple (no Apple — a paid Apple Developer account is out of the pilot budget). The multi-button login is now the intended model.**
2. Admin as a role on the consumer login modal. Build: separate `/admin` surface + `AdminUser` credentials/TOTP (ADR-007/010); guest↔host = context switch in one account, never a login role.

**B. Locked features absent from the design — add during build:**
3. Per-listing FAQ section (listing page + wizard/edit; `ListingFaqEntry`).
4. Admin §5.7 คำถามที่ตอบไม่ได้ queue (UnansweredQuestion → suggest-as-FAQ).
5. ถูกต้องตามกฎหมาย badge tier (optional license upload in wizard ⑥ + listing badge).
6. KYC ⑥: religion-line redaction instruction (PDPA §26) + explicit consent checkbox.
7. Concierge: in-chat confirmation card → `submit_booking_request` → QR in thread (artifact has draft+deep-link only — ADR-006 v1 behavior).
8. Account: notification preferences + PDPA export/delete (§3.7).
9. Phone-OTP verification UI in the guest request flow (ladder step 2).
10. Instant-mode strike acknowledgment in wizard ⑤.
11. Admin audit-log viewer.
12. Verify during build (unreached in audit): search-results map with price pins + filter chips/sort (§3.1).

**C. Demo-data nits (do not replicate):** `BK-xxxx` code format in profile (must be UR-YYMM-NNNN); cross-villa copy/attraction mixups; deposit amount inconsistency; **regions must lead with Pattaya** (GTM) — the artifact features หัวหิน/เขาใหญ่/ภูเก็ต.
