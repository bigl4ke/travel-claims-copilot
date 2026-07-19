import { describe, expect, it } from "vitest";

import { verifyDemoAccess } from "../../lib/access/demo-access";

describe("demo access", () => {
  it.each([
    [undefined, undefined],
    [null, null],
    ["", ""],
    ["   ", "   "],
    ["demo", undefined],
    [undefined, "demo"],
    ["", "demo"],
    ["demo", ""]
  ] as const)(
    "never grants access without values: supplied=%s configured=%s",
    (supplied, configured) => {
      expect(
        verifyDemoAccess({ consent: true, suppliedCode: supplied, configuredCode: configured })
      ).toBe(false);
    }
  );

  it("requires explicit consent even when the code is exact", () => {
    expect(verifyDemoAccess({ consent: false, suppliedCode: "demo", configuredCode: "demo" })).toBe(
      false
    );
  });

  it.each([
    ["demo", "demo"],
    ["旅行🔐", "旅行🔐"]
  ])("accepts exact non-empty byte-for-byte values", (supplied, configured) => {
    expect(
      verifyDemoAccess({ consent: true, suppliedCode: supplied, configuredCode: configured })
    ).toBe(true);
  });

  it.each([
    ["demo", "demo-long", "different lengths"],
    ["demo", "Demo", "different case"],
    [" demo", "demo", "leading whitespace"],
    ["Ｄｅｍｏ", "Demo", "full-width Unicode"],
    ["é", "e\u0301", "Unicode normalization variants"]
  ])("rejects %s and %s as %s", (supplied, configured) => {
    expect(
      verifyDemoAccess({ consent: true, suppliedCode: supplied, configuredCode: configured })
    ).toBe(false);
  });
});
