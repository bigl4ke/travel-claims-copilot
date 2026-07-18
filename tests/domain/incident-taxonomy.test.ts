import { describe, expect, it } from "vitest";

import { normalizeIncidentInput } from "../../lib/domain/incident-taxonomy";
import { normalizeIssueType } from "../../lib/issueTaxonomy";

describe("normalizeIncidentInput", () => {
  it.each([
    ["hotel_walk", "hotel_walk"],
    ["controllable_airline_delay", "airline_delay"],
    ["controllable_airline_cancellation", "airline_cancellation"]
  ] as const)("normalizes %s without deriving eligibility", (input, incident) => {
    expect(normalizeIncidentInput(input)).toEqual({
      incident,
      legacy: input !== incident,
      needsSubtype: false
    });
  });

  it("keeps the EU alias ambiguous", () => {
    expect(normalizeIncidentInput("eu261_delay_or_cancellation")).toEqual({
      incident: null,
      legacy: true,
      needsSubtype: true
    });
  });

  it.each(["baggage_delay", "hotel_property_loss", "insurance_claim"])(
    "rejects dormant public input %s",
    (input) => expect(normalizeIncidentInput(input)).toBeNull()
  );

  it.each(["constructor", "toString", "__proto__"])("rejects inherited alias key %s", (input) =>
    expect(normalizeIncidentInput(input)).toBeNull()
  );

  it.each(["constructor", "toString", "__proto__"])(
    "rejects inherited compatibility key %s",
    (input) => expect(normalizeIssueType(input)).toBeUndefined()
  );
});
