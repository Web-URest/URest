/**
 * Thai bank reference list for the host payout-account form (PRODUCT_FLOWS §4.1 ⑥).
 *
 * Codes are the BOT 3-digit bank codes (also Opn's `bank` field). Names are
 * proper-noun data — like Region names they are NOT i18n keys (ADR-008: dates/
 * prices/data are Thai-aware in code, not translations). The Select renders the
 * Thai name in both locales.
 */

export interface ThaiBank {
  /** BOT 3-digit bank code, stored on `PayoutAccount.bankCode`. */
  code: string;
  nameTh: string;
}

/** The banks Thai hosts realistically use; extend by editing this list. */
export const THAI_BANKS: readonly ThaiBank[] = [
  { code: "002", nameTh: "ธนาคารกรุงเทพ (BBL)" },
  { code: "004", nameTh: "ธนาคารกสิกรไทย (KBANK)" },
  { code: "006", nameTh: "ธนาคารกรุงไทย (KTB)" },
  { code: "011", nameTh: "ธนาคารทหารไทยธนชาต (ttb)" },
  { code: "014", nameTh: "ธนาคารไทยพาณิชย์ (SCB)" },
  { code: "025", nameTh: "ธนาคารกรุงศรีอยุธยา (BAY)" },
  { code: "069", nameTh: "ธนาคารเกียรตินาคินภัทร (KKP)" },
  { code: "022", nameTh: "ธนาคารซีไอเอ็มบีไทย (CIMBT)" },
  { code: "067", nameTh: "ธนาคารทิสโก้ (TISCO)" },
  { code: "024", nameTh: "ธนาคารยูโอบี (UOB)" },
  { code: "071", nameTh: "ธนาคารไทยเครดิต (TCD)" },
  { code: "073", nameTh: "ธนาคารแลนด์ แอนด์ เฮ้าส์ (LH Bank)" },
  { code: "030", nameTh: "ธนาคารออมสิน (GSB)" },
  { code: "034", nameTh: "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)" },
  { code: "035", nameTh: "ธนาคารอาคารสงเคราะห์ (ธอส.)" },
];

const CODES = new Set(THAI_BANKS.map((b) => b.code));

/** True if `code` is a known Thai bank code (server-side payout validation). */
export function isValidBankCode(code: string): boolean {
  return CODES.has(code);
}
