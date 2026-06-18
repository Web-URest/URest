/**
 * Contact-info redaction for pre-CONFIRMED message bodies (PRODUCT_FLOWS §3.5,
 * ADR-011 №5, issue #24). The anti-scam floor: a guest must not be able to move
 * the deal off-platform before money is held, so phone numbers, bank accounts,
 * LINE IDs and URLs are masked at write time. Aggressive within the named
 * patterns (a leaked contact is the whole scam vector) — the mask only applies
 * pre-payment; everything written after CONFIRMED is stored unmasked.
 *
 * Pure + deterministic. `wasMasked` is true iff anything was redacted.
 */
const MARK = "[ปกปิด]";

export function maskBody(raw: string): { masked: string; wasMasked: boolean } {
  let s = raw;

  // URLs — explicit scheme / www, then bare common-TLD domains.
  s = s.replace(/(?:https?:\/\/|www\.)\S+/gi, MARK);
  s = s.replace(/\b[a-z0-9-]+\.(?:com|net|org|co|io|app|me|biz|info|xyz)(?:\/\S*)?\b/gi, MARK);

  // LINE — @handles, then Thai/English "LINE id" markers + the following token.
  // The Thai negative lookbehind keeps "ออนไลน์" (online) from tripping "ไลน์".
  s = s.replace(/@[\w.\-]{2,}/g, MARK);
  s = s.replace(/(?<![ก-๛])(?:ไอดีไลน์|ไลน์ไอดี|ไลน์|ไอดี)\s*[:：]?\s*[\w.\-]+/g, MARK);
  s = s.replace(/\bline(?:\s*id)?\s*[:：]?\s*[\w.\-]+/gi, MARK);

  // Phone / bank account — digit runs (spaces/dashes allowed) totalling ≥9 digits.
  // The threshold protects small numbers: guest counts, nights, times, 8-digit dates.
  s = s.replace(/\+?\d[\d\s-]*\d/g, (m) => ((m.match(/\d/g)?.length ?? 0) >= 9 ? MARK : m));

  return { masked: s, wasMasked: s !== raw };
}
