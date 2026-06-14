# U-Rest — Business Plan (Operating Plan, v1)

**Date:** 2026-06-12 · **Status:** Working document; §1 is liftable for incubator/grant applications
**Companions:** `PRD.md`, `PRODUCT_FLOWS.md`, `docs/adr/`

---

## 1. Executive summary (one page — lift for KMUTT incubator / NIA / depa applications)

**U-Rest** is an escrow-protected booking platform for Thai pool villas, starting in Pattaya. Thai group travelers today book pool villas through Facebook groups and LINE chats by bank-transferring deposits to strangers — and deposit scams (เพจปลอม, สลิปปลอม, วิลล่าไม่มีจริง) are endemic enough that "โดนโกงพูลวิลล่า" is its own genre of news story. Hosts are victims too: fake payment slips and no-shows.

**The product:** every villa is identity-verified before listing (Thai ID + right-to-rent documents, reviewed by a human); guests pay 100% through the platform (PromptPay/card via Opn Payments); **U-Rest holds the money in escrow and releases it to the host only after the guest checks out**. Disputes freeze the payout. All booking and payment stays in-app — contact details are masked until payment and hosts agree to take bookings only through U-Rest — so the scam can't move off-platform. An AI concierge (น้องเรสต์, built on Claude) helps groups find and compare villas — but only a human ever pays.

**The model:** 10% host-side commission, only on completed bookings. No listing fees, no guest fees, no hidden charges (ไม่มีค่าธรรมเนียมแอบแฝง). Net margin after payment-gateway costs: ~74–80% of commission.

**Why now / why us:** Pattaya's existing villa "platforms" are LINE-broker directories — no real-time availability, no checkout, no escrow. OTAs (Agoda) carry licensed inventory at 15–20% commission and ignore the gray-market group-villa segment. The trust gap is the product gap. Team of 4–5 (KMUTT), 2 developers building on an AI-accelerated stack; infrastructure runs under ฿1,000/month, so the pilot needs no outside capital — the ask from incubators is mentorship, legal review, and credibility, not runway.

**Pilot goal (6 months):** 15 verified Pattaya villas live, 10 confirmed bookings/month, zero payment incidents.

---

## 2. Problem & market

### The problem, concretely
- Organizer collects ฿15,000–30,000 from 10–25 friends, then must transfer a 30–50% deposit to a stranger's personal bank account found in a Facebook group. No recourse if the page is fake, the photos are stolen, or the villa is double-booked.
- Hosts get burned in mirror image: forged slips, last-minute no-shows after soft "confirmations," and Facebook's total absence of booking structure (calendar chaos = double bookings).
- The existing middlemen (broker pages) take agency commissions but still settle by bank transfer and LINE chat — they intermediate *discovery*, not *trust*.

### Market shape (defensible observations, not projections)
- Supply proxy: a single Pattaya aggregator markets **1,000+ pool villas**; multiple competing directories exist for Pattaya alone, and the model repeats in Hua Hin, Khao Yai, Cha-am, Kanchanaburi.
- Price points: ฿6,000–฿30,000+/night; group bookings are commonly 1–2 nights, weekend-weighted, with strong Thai-holiday peaks (system maintains the holiday calendar for exactly this reason).
- Demand proxy: pool-villa FB groups count members in the hundreds of thousands; "พูลวิลล่า + region" is an established Thai search/TikTok category.
- **Serviceable obsessed market (pilot):** 15 villas × ~8 bookings/month at ~฿15,000 = ~฿1.8M GMV/month ceiling → ~฿180k/month commission ceiling at full utilization. The pilot does not need to win the market; it needs to prove the trust mechanism converts.

## 3. Product (summary — contract lives in PRD.md / PRODUCT_FLOWS.md)

Verified listings → request-to-book or instant-book → 100% in-app payment → escrow ledger (HELD → RELEASABLE → PAID, FROZEN on dispute) → host paid after the guest checks out. In-app messaging with contact masking until confirmed. Per-villa calendars, seasonal pricing with Thai-holiday awareness. AI concierge for discovery with a hard no-payment boundary. Admin = verify humans, move money, judge disputes; everything else automated.

## 4. Competition & positioning

| Alternative | What it does well | What it can't do | Their take |
|---|---|---|---|
| **FB groups / LINE direct** | Inventory breadth, zero platform fee | Trust. The scam IS this channel | 0% (scam risk is the fee) |
| **Broker directories** (poolvillapattaya.co.th, banpakpoolvillathailand.com, …) | SEO, big catalogs, human agents | Real-time availability, instant checkout, escrow, verified reviews — they settle by transfer + LINE like everyone else | ~10–20% agency margin |
| **OTAs (Agoda/Booking)** | Trust brand, traffic | Group-villa gray-market segment; hosts without formal docs; PromptPay escrow story; Thai-group UX (เงินประกัน, party rules) | 15–20% |
| **U-Rest** | Productized trust: verification, escrow, masking, reviews | Brand recognition, inventory (day 1) | **10%** |

**Positioning (locked):** the trust layer versus FB-direct. Marketing names the scam, not competitors — "จองพูลวิลล่าไม่ต้องเสี่ยงโดนโกง: เงินถึงเจ้าของหลังเช็คเอาท์เท่านั้น." Broker directories are treated as a host-recruitment pool, never attacked. The verification gate is framed as the brand: "ทุกที่พักผ่านการตรวจสอบ เพื่อให้ผู้เข้าพักกล้าจ่าย."

**The two hard questions, answered:**
- *Why does a host pay 10%?* New guests they can't reach on FB + protection from fake slips (escrow verifies payment before dates lock) + free professional listing (we shoot the photos) + calendar/pricing tools. They already pay brokers this much for less.
- *What about bookings going off-platform?* **Not accepted — booking through U-Rest is a host obligation (ADR-012).** Taking a listed villa's bookings outside U-Rest violates the host agreement. The enforceable teeth: pre-payment contact masking (blocks the scam vector), a forced CANCELLED_BY_HOST + strike → suspension penalty when an off-platform booking double-books a paid U-Rest guest, and the structural carrot that the host is paid — and protected, reviewed, and ranked — only in-app, with payout released after checkout. Honest limit: a guest quietly rebooking the same villa direct a year later can't be detected, so we don't pretend to police it — the policy prohibits it and the incentives discourage it. Retention comes from product gravity (reviews, ranking, tools); a repeat-discount mechanic is parked for v2.

## 5. Business model & unit economics

**Revenue:** 10% commission, host-side, charged only on completed bookings (deducted from payout). Guest pays listed price exactly. No deposits, no partial payments, damage deposit is cash at check-in (never through the platform).

**Unit economics — typical ฿15,000 booking (locked fee policy: U-Rest absorbs gateway fees; PromptPay-first checkout):**

| | PromptPay (default) | Card |
|---|---|---|
| Commission (10%) | ฿1,500 | ฿1,500 |
| Opn fee on full amount (incl. 7% VAT on fee) | −฿265 (1.766%) | −฿586 (3.906%) |
| Host payout transfer | −฿30 | −฿30 |
| **Contribution per booking** | **฿1,205** | **฿884** |

Blended at an expected 80/20 PromptPay/card mix: **~฿1,140/booking (~7.6% of GMV)**.

**Fixed costs (pilot, monthly):**

| Item | ฿/month |
|---|---|
| Railway (app + Postgres, SG) | ~180–360 |
| Cloudflare R2 + domain (amortized) | ~50 |
| Claude API (น้องเรสต์, Haiku) | ~100–300 |
| LINE OA / Resend email | 0 (free tiers; LINE paid plan scales with bookings) |
| SMS OTP (~฿0.5 × volume) | ~50 |
| **Total** | **~฿400–800** ✅ under the ฿1,000 ceiling |

**Break-even: 1 booking/month.** At pilot target (10/month): ~฿11,400 contribution — covers infra ~15×. The real costs are founder hours (recruiting, approvals, payouts, disputes) and travel to Pattaya. **This business is feasibility-constrained by trust and supply, not by capital.**

## 6. Legal & compliance roadmap

**Stance:** operate the pilot lean-but-honest as an individual, with every structure chosen to be upgrade-compatible; convert to a company at defined triggers. Items marked ⚖️ need a real lawyer at incorporation — budget ฿30–80k then, not now.

### 6.1 Entity staging (locked decision)
- **Now → pilot:** one named founder operates as an individual (บุคคลธรรมดา): Opn individual merchant account, personal bank account dedicated solely to U-Rest flows, meticulous ledger (the product's own ledger is the book of record). Team agreement in writing (simple MOU: equity intent, IP assignment to the future company, who is the account-holding founder). ⚖️ later.
- **Register Thai Co., Ltd. at the FIRST trigger:** ฿100k GMV/month sustained · Opn requires juristic person for marketplace transfers · onboarding hosts beyond personal/extended network at scale · external funding or grant requiring an entity. Cost ~฿6–15k registration + ~฿15–30k/year accounting/audit (mandatory even at low revenue — why we don't register early).
- **VAT registration** only at ฿1.8M/year *commission* revenue (not GMV) — far away.

### 6.2 Money handling
- U-Rest collects **as agent of the host** (agent-of-payee clause in Host T&Cs); merchant of record on its own Opn account; funds rest in the Opn balance, not personal savings (ADR-001/003). This is the standard OTA structure and the good-faith reading of the Payment Systems Act perimeter. ⚖️ confirm structure at incorporation; revisit if BOT guidance on platform escrow changes.
- The founder's tax position: only the 10% commission is income; pass-through guest money is recorded as agency collection. Dedicated account + ledger export makes this defensible. File personal income tax accordingly.

### 6.3 Hotel Act (host legality — locked two-tier policy)
- Daily rental <30 days = hotel business **unless** the property qualifies for non-hotel registration (สถานที่พักที่ไม่เป็นโรงแรม: ≤8 rooms, ≤30 guests, registered at the district office) — most pool villas qualify.
- **Required for listing:** Thai ID + proof of ownership or written right-to-rent. **Encouraged, badged, rank-boosted:** hotel license or non-hotel registration → ถูกต้องตามกฎหมาย badge. Host warrants legal compliance in T&Cs; U-Rest is an intermediary. The wizard teaches hosts the ≤8-room registration exists — converting legality into a feature, and nudging the whole local market toward compliance.
- Platform risk of hosting unlicensed properties is acknowledged and mitigated (warranty clause, badge incentive, removal on complaint). ⚖️ revisit at scale.

### 6.4 Platform & data obligations
- **ETDA Digital Platform Services notification** (Royal Decree B.E. 2565): file the small-platform notification before launch (individual operator under ฿1.8M/year qualifies for the simplified tier). Free; a launch-gate checkbox in PRD §6.
- **PDPA** (full schema-level mapping in ADR-010): privacy policy with **processor + cross-border disclosure** (Railway SG, Cloudflare, Anthropic US, Resend, Google, Meta — §28), purpose-limited consent recorded in the `Consent` table (signup, KYC upload, chat transcripts), **ID-card religion-line redaction** at upload (religion = §26 sensitive data), private-bucket storage with signed URLs, 90-day deletion of rejected-listing KYC docs, export/delete runbook, **72-hour PDPC breach notification runbook**. DPO not required at pilot scale; lightweight RoPA + DPO re-check at incorporation. ⚖️
- **Computer Crime Act §26:** retain access/traffic logs **≥90 days** (service-provider obligation — a keep-requirement that coexists with PDPA minimization).
- **Opn prerequisites:** published Privacy Policy + Business Policy pages.
- **Not applicable (verified reasoning, monitor):** TAT tour-operator license — U-Rest sells accommodation booking only, no tours/transport packages. If v2 adds packages, re-check. ⚖️ confirm at incorporation.

## 7. Go-to-market (locked: phased density)

### Phase A — Supply (months 1–2, overlaps with build)
Founder-led white-glove recruiting, **Pattaya/Jomtien/Huay Yai only**: source owner-operators from FB groups + broker directories + on-the-ground visits. The pitch: *"ลงประกาศฟรี เราถ่ายรูปให้ ทำเพจให้ดูแพง — คุณจ่าย 10% เฉพาะเมื่อมีการจองจริง และเราการันตีว่าเงินจริง สลิปปลอมเข้าไม่ได้."* We do everything: photos, listing copy, seasonal pricing setup, non-hotel registration guidance (badge upsell). Target: 15 recruited, ≥8 live at launch. **Kill criterion:** if 30 serious host conversations yield <8 listings, the host value proposition is wrong — stop and rework before building demand.

### Phase B — Demand (months 2–4)
Organic only (budget): TikTok/IG villa tours + anti-scam content (scam-anatomy explainers are inherently shareable; the escrow strip is the product demo), posts in the same FB groups where scams happen, university group-trip seeding (KMUTT network — birthdays/graduation trips tolerate beta software). Every listing page is also SEO inventory against "พูลวิลล่าพัทยา" long-tails.

### Phase C — Flywheel (months 3–6)
Hosts redirect their own FB/LINE inquiries into U-Rest links (escrow protects *them* from fake slips — by month 3 they've experienced it). Reviews accumulate → ranking matters → badge + instant-book become host status symbols. **Expansion trigger to region 2 (Khao Yai or Hua Hin, chosen by where search/AI-concierge demand actually points):** Pattaya at 15+ live villas AND 10+ bookings/month for two consecutive months.

## 8. Team & operations

| Role (4–5 people) | Owns |
|---|---|
| Dev ×2 (with Claude Code) | Build phases 1–5, on-call for money-path incidents |
| Supply/ops lead | Host recruiting trips, photography, listing approvals (≤24h SLA), payout runs |
| Content/demand | TikTok/IG/FB pipeline, แอดมินเพจ guest support LINE OA |
| Founder (account holder) | Money custody, disputes, legal filings, metrics |

Admin workload is designed into the product (itemized NEEDS_INFO, grouped payout runs, reconciliation screens — PRODUCT_FLOWS §5) so 24h SLAs hold at pilot volume on student hours. **Capacity ceiling acknowledged:** ~30 bookings/month on current staffing before payout/dispute load forces automation (the v2 list is sequenced for exactly that).

## 9. Milestones

| When | Milestone | Exit criteria |
|---|---|---|
| M0 (done) | Phase 0 design | DESIGN_SPEC + 11 mockups + PRODUCT_FLOWS ✅ |
| M1 | Build phases 1–2 (foundation, listings) | Wizard→approval→live listing in production |
| M2 | Build phase 3 (booking/escrow) + Opn live + supply ≥8 villas | PRD §6 launch gate fully green |
| M3 | **Soft launch** (university + FB organic) | First stranger booking completes, payout PAID, zero incidents |
| M4–M5 | Phases 4–5 (AI concierge, trust polish) + demand push | 10 bookings/month |
| M6 | Review: expansion trigger / incorporation triggers | Go/no-go region 2; entity decision per §6.1 |

## 10. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Supply cold-start fails (hosts won't list) | Medium | White-glove + 10%-only-on-success + kill criterion in §7A forces early learning |
| Organizer won't pay 100% upfront to an unknown brand | Medium | Escrow messaging at every step, card option (chargeback comfort), refund promise via the report-before-checkout dispute window, university seeding builds first reviews among forgiving users |
| Opn gates marketplace transfers / individual account limits | Medium | Spike pre-Phase-3 (ADR-001); fallback = manual payouts (v1 plan anyway); escalation = incorporation trigger |
| A scam gets through verification | Low/severe | Human review + name-matching + reverse-image checks; escrow means money is recoverable pre-payout; dispute freeze; incident = full refund from commission reserve |
| Founder-account risk (individual pilot): account holder is personally liable | Certain (by design) | Dedicated account, product ledger as book of record, low GMV ceiling during pilot, incorporation triggers deliberately conservative |
| Team is students (time, graduation, burnout) | Medium | Scope discipline (one region, parked v2), automation-first product design, MOU on equity/IP |
| Regulatory shift on platform escrow or short-term rentals | Low | Agent-of-payee structure is upgrade-compatible; badge system already pushes supply toward licensed status |

## 11. Funding stance

None sought for the pilot — infrastructure is ~฿400–800/month and the constraint is hours, not money. Apply to **KMUTT incubation / NIA / depa student-startup grants** for credibility, mentorship, and legal-review access (the §1 summary is the application core). Revisit outside capital only after the pilot proves conversion (M6), where money would buy supply-recruiting capacity, not product.
