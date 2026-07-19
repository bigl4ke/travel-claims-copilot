import { describe, expect, it } from "vitest";

import { redactNarrative } from "../../lib/privacy/redaction";

describe("redactNarrative", () => {
  it("redacts English contact, payment, and labelled identifiers before generic patterns", () => {
    const message =
      "Flight AF123 from CDG to JFK on 2026-07-19 was delayed 180 minutes. " +
      "Email synthetic.traveler@example.test, phone +1 (202) 555-0147, card 4242 4242 4242 4242. " +
      "Booking reference BK-729104, ticket number 2201234567890, membership ID MB-908172, " +
      "reservation number RSV-441920.";

    expect(redactNarrative(message)).toBe(
      "Flight AF123 from CDG to JFK on 2026-07-19 was delayed 180 minutes. " +
        "Email [REDACTED_EMAIL], phone [REDACTED_PHONE], card [REDACTED_PAYMENT]. " +
        "Booking reference [REDACTED_IDENTIFIER], ticket number [REDACTED_IDENTIFIER], " +
        "membership ID [REDACTED_IDENTIFIER], reservation number [REDACTED_IDENTIFIER]."
    );
  });

  it("redacts Chinese contact, payment, and labelled identifiers without treating a flight label as private", () => {
    const message =
      "航班号CA1234于2026-07-19从CDG飞往JFK，延误180分钟。" +
      "邮箱synthetic.user@example.test，电话13800138000，银行卡号5555-5555-5555-4444。" +
      "预订编号CN-729104，票号7812345678901，会员号VIP-908172，预约编号RSV-441920。";

    expect(redactNarrative(message)).toBe(
      "航班号CA1234于2026-07-19从CDG飞往JFK，延误180分钟。" +
        "邮箱[REDACTED_EMAIL]，电话[REDACTED_PHONE]，银行卡号[REDACTED_PAYMENT]。" +
        "预订编号[REDACTED_IDENTIFIER]，票号[REDACTED_IDENTIFIER]，" +
        "会员号[REDACTED_IDENTIFIER]，预约编号[REDACTED_IDENTIFIER]。"
    );
  });

  it.each([
    ["phone 2025550147", "phone [REDACTED_PHONE]"],
    ["phone 020 7946 0958", "phone [REDACTED_PHONE]"],
    ["电话010-88888888", "电话[REDACTED_PHONE]"],
    ["contact +8613800138000", "contact [REDACTED_PHONE]"]
  ])("redacts a high-confidence phone form in %s", (message, expected) => {
    expect(redactNarrative(message)).toBe(expected);
  });

  it.each([
    ["card 1234 5678 9012", "card [REDACTED_PAYMENT]"],
    ["支付卡号 123456789012", "支付卡号 [REDACTED_PAYMENT]"]
  ])("redacts a labelled 12-digit card-like payment in %s", (message, expected) => {
    expect(redactNarrative(message)).toBe(expected);
  });

  it.each([
    ["Reservation: RSV123", "Reservation: [REDACTED_IDENTIFIER]"],
    ["Booking #ABC123", "Booking #[REDACTED_IDENTIFIER]"],
    ["Ticket number TKT_123/ABC", "Ticket number [REDACTED_IDENTIFIER]"],
    ["预订 编号 CN/729104", "预订 编号 [REDACTED_IDENTIFIER]"],
    ["订单号 ORDER_123/45", "订单号 [REDACTED_IDENTIFIER]"],
    ["常旅客号 FF_123/45", "常旅客号 [REDACTED_IDENTIFIER]"]
  ])("redacts a labelled identifier form in %s", (message, expected) => {
    expect(redactNarrative(message)).toBe(expected);
  });

  it.each([
    "Reservation: confirmed",
    "Ticket: cancelled",
    "Membership: Gold",
    "Booking: unavailable"
  ])("preserves legitimate punctuation-only status text in %s", (message) => {
    expect(redactNarrative(message)).toBe(message);
  });

  it("preserves route, date, delay, and English and Chinese flight facts", () => {
    const facts =
      "Flights AF1234 and CA1234, 航班号CA1234, CDG to JFK on 2026-07-19, delayed 180 minutes.";

    expect(redactNarrative(facts)).toBe(facts);
  });
});
