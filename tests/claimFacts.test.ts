import { describe, expect, it } from "vitest";

import {
  emptyClaimFacts,
  getMissingClaimFields,
  normalizeClaimFacts,
  parseClaimFacts
} from "../lib/claimFacts";
import { assessEu261Candidate } from "../lib/jurisdiction";

describe("ClaimFacts schema", () => {
  it("rejects values outside the supported issue taxonomy", () => {
    const result = parseClaimFacts({ ...emptyClaimFacts(), issueType: "lost_baggage" });

    expect(result.success).toBe(false);
  });

  it("normalizes an issue into provider and disruption types", () => {
    const facts = normalizeClaimFacts({
      ...emptyClaimFacts(),
      issueType: "controllable_airline_cancellation"
    });

    expect(facts.providerType).toBe("airline");
    expect(facts.disruptionType).toBe("cancellation");
  });

  it("computes missing EU261 facts on the server", () => {
    const facts = normalizeClaimFacts({
      ...emptyClaimFacts(),
      issueType: "eu261_delay_or_cancellation",
      provider: "Air France",
      origin: { city: "Paris", airport: null, country: null, region: null },
      disruptionType: "cancellation"
    });

    expect(facts.origin.country).toBe("France");
    expect(facts.origin.region).toBe("EU_EEA_CH");
    expect(getMissingClaimFields(facts)).toEqual([
      "destination",
      "arrivalDelayMinutes",
      "disruptionReason"
    ]);
  });
});

describe("jurisdiction assessment", () => {
  it("marks a Paris departure as a possible EU261 itinerary", () => {
    const facts = {
      ...emptyClaimFacts(),
      provider: "Air France",
      origin: { city: "Paris", airport: "CDG", country: null, region: null }
    };

    expect(assessEu261Candidate(facts)).toEqual({
      isCandidate: true,
      needsOperatingCarrierCheck: false,
      reasons: ["departure_region_eu_eea_ch"]
    });
  });

  it("requires carrier confirmation for a non-EU departure arriving in the EU", () => {
    const facts = {
      ...emptyClaimFacts(),
      origin: { city: "New York", airport: "JFK", country: null, region: null },
      destination: { city: "Paris", airport: "CDG", country: null, region: null }
    };

    expect(assessEu261Candidate(facts).needsOperatingCarrierCheck).toBe(true);
  });
});
