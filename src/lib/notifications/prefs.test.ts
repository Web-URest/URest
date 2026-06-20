import { NotificationChannel } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  ALL_GROUPS,
  channelAllowed,
  ESSENTIAL_GROUPS,
  GROUP_OF,
  normalizePrefs,
  type NotifPrefs,
} from "./prefs";

const { EMAIL, LINE } = NotificationChannel;

describe("channelAllowed", () => {
  it("essential-group EMAIL is locked on even when prefs say off", () => {
    const prefs: NotifPrefs = { BOOKING: { email: false, line: false } };
    // BOOKING_REQUESTED ∈ BOOKING (essential) → email always sends
    expect(channelAllowed(prefs, "BOOKING_REQUESTED", EMAIL)).toBe(true);
  });

  it("essential-group LINE is still toggleable", () => {
    const prefs: NotifPrefs = { PAYMENTS: { email: false, line: false } };
    expect(channelAllowed(prefs, "PAYMENT_RECEIVED_GUEST", LINE)).toBe(false);
  });

  it("optional-group EMAIL is suppressible", () => {
    const prefs: NotifPrefs = { MESSAGES: { email: false, line: true } };
    expect(channelAllowed(prefs, "MESSAGE_NEW", EMAIL)).toBe(false);
    expect(channelAllowed(prefs, "MESSAGE_NEW", LINE)).toBe(true);
  });

  it("defaults to on when no prefs are stored (null) and when a group is unset", () => {
    expect(channelAllowed(null, "MESSAGE_NEW", EMAIL)).toBe(true);
    expect(channelAllowed({}, "REVIEW_RECEIVED_HOST", LINE)).toBe(true);
    expect(channelAllowed({ MESSAGES: {} }, "MESSAGE_NEW", EMAIL)).toBe(true);
  });

  it("never suppresses an unknown template key", () => {
    expect(channelAllowed({}, "SOME_FUTURE_KEY", EMAIL)).toBe(true);
    expect(channelAllowed({}, "SOME_FUTURE_KEY", LINE)).toBe(true);
  });
});

describe("GROUP_OF taxonomy", () => {
  it("maps every essential group to ESSENTIAL_GROUPS", () => {
    for (const g of ESSENTIAL_GROUPS) expect(ALL_GROUPS).toContain(g);
    expect([...ESSENTIAL_GROUPS].sort()).toEqual(["BOOKING", "LISTING", "PAYMENTS"]);
  });

  it("classifies the transactional keys as essential and the soft keys as optional", () => {
    expect(GROUP_OF.BOOKING_CANCELLED_BY_HOST).toBe("BOOKING");
    expect(GROUP_OF.PAYMENT_REFUNDED_GUEST).toBe("PAYMENTS");
    expect(GROUP_OF.PAYOUT_PAID_HOST).toBe("PAYMENTS");
    expect(GROUP_OF.LISTING_REJECTED).toBe("LISTING");
    expect(GROUP_OF.MESSAGE_NEW).toBe("MESSAGES");
    expect(GROUP_OF.REVIEW_RECEIVED_HOST).toBe("REVIEWS_REPORTS");
    expect(ESSENTIAL_GROUPS.has("MESSAGES")).toBe(false);
    expect(ESSENTIAL_GROUPS.has("REVIEWS_REPORTS")).toBe(false);
  });
});

describe("normalizePrefs", () => {
  it("forces essential-group email to true regardless of input", () => {
    const out = normalizePrefs({ BOOKING: { email: false, line: false } });
    expect(out.BOOKING?.email).toBe(true);
    expect(out.BOOKING?.line).toBe(false);
  });

  it("keeps optional-group toggles as submitted", () => {
    const out = normalizePrefs({ MESSAGES: { email: false, line: false } });
    expect(out.MESSAGES).toEqual({ email: false, line: false });
  });

  it("drops unknown groups and coerces missing/non-boolean channels to on", () => {
    const out = normalizePrefs({ NONSENSE: { email: false }, REVIEWS_REPORTS: { email: "no" } });
    expect("NONSENSE" in out).toBe(false);
    expect(out.REVIEWS_REPORTS).toEqual({ email: true, line: true });
  });

  it("returns clean prefs for empty input", () => {
    expect(normalizePrefs({})).toEqual({});
    expect(normalizePrefs(null)).toEqual({});
  });
});
