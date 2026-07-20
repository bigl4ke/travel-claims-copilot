import { describe, expect, it } from "vitest";

import {
  emptyClaimFacts,
  getMissingClaimFields,
  normalizeClaimFacts,
  parseClaimFacts
} from "../lib/claimFacts";
import { POST } from "../app/api/analyze/route";
import { assessEu261Candidate } from "../lib/jurisdiction";

describe("ClaimFacts schema", () => {
  it("rejects values outside the supported issue taxonomy", () => {
    const result = parseClaimFacts({ ...emptyClaimFacts(), issueType: "lost_baggage" });

    expect(result.success).toBe(false);
  });

  it("normalizes an issue into provider and disruption types", () => {
    const facts = normalizeClaimFacts({
      ...emptyClaimFacts(),
      issueType: "airline_cancellation"
    });

    expect(facts.providerType).toBe("airline");
    expect(facts.disruptionType).toBe("cancellation");
  });

  it("computes missing route facts independently from policy jurisdiction", () => {
    const facts = normalizeClaimFacts({
      ...emptyClaimFacts(),
      issueType: "airline_cancellation",
      provider: "Air France",
      origin: { city: "Paris", airport: null, country: null, region: null },
      disruptionType: "cancellation"
    });

    expect(facts.origin.country).toBe("France");
    expect(facts.origin.region).toBe("EU_EEA_CH");
    expect(getMissingClaimFields(facts)).toEqual([
      "destination",
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

  it("keeps the incident type independent from EU261 jurisdiction", () => {
    const facts = normalizeClaimFacts({
      ...emptyClaimFacts(),
      issueType: "airline_cancellation",
      provider: "Air France",
      operatingCarrier: "Air France",
      origin: { city: "Paris", airport: "CDG", country: null, region: null },
      destination: {
        city: "New York",
        airport: "JFK",
        country: null,
        region: null
      },
      disruptionType: "cancellation",
      disruptionReason: "late_inbound_aircraft",
      arrivalDelayMinutes: 240,
      confidence: "medium"
    });

    expect(facts.issueType).toBe("airline_cancellation");
  });
});

describe("structured analyze API", () => {
  it("analyzes validated structured facts without reclassifying the description", async () => {
    const facts = normalizeClaimFacts({
      ...emptyClaimFacts(),
      issueType: "airline_cancellation",
      provider: "Air France",
      operatingCarrier: "Air France",
      origin: { city: "Paris", airport: "CDG", country: null, region: null },
      destination: {
        city: "New York",
        airport: "JFK",
        country: null,
        region: null
      },
      disruptionType: "cancellation",
      disruptionReason: "mechanical",
      arrivalDelayMinutes: 240,
      confidence: "high"
    });
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description:
          "My Air France flight from Paris was cancelled and I arrived four hours late.",
        facts
      })
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.issueType).toBe("airline_cancellation");
    expect(result.policyRegions).toEqual(["EU_EEA_CH", "US"]);
    expect(result.legalRegimes).toEqual(["EU261", "US_DOT_REFUND"]);
    expect(result.controllability).toBe("controllable");
    expect(result.officialBasis[0]?.policy_id).toBe("eu261_regulation_261_2004");
    expect(result.suggestedAsks.aggressive).toContain(
      "Fixed EU261 compensation if eligibility is met"
    );
  });

  it("returns the primary EU261 regulation for a Paris departure", async () => {
    const facts = {
      ...emptyClaimFacts(),
      issueType: "airline_cancellation" as const,
      providerType: "airline" as const,
      provider: "Air France",
      operatingCarrier: "Air France",
      origin: { city: "Paris", airport: "CDG", country: null, region: null },
      destination: {
        city: "New York",
        airport: "JFK",
        country: null,
        region: null
      },
      disruptionType: "cancellation" as const,
      disruptionReason: "late_inbound_aircraft" as const,
      arrivalDelayMinutes: 240,
      confidence: "medium" as const
    };
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description:
          "My Air France flight from Paris was cancelled and I arrived four hours late.",
        facts
      })
    });

    const response = await POST(request);
    const result = await response.json();
    const policyIds = result.officialBasis.map(
      (policy: { policy_id: string }) => policy.policy_id
    );

    expect(response.status).toBe(200);
    expect(result.issueType).toBe("airline_cancellation");
    expect(result.policyRegions).toEqual(["EU_EEA_CH", "US"]);
    expect(result.legalRegimes).toEqual(["EU261", "US_DOT_REFUND"]);
    expect(result.controllability).toBe("unknown");
    expect(result.evidenceCoverage).toEqual(
      expect.objectContaining({
        officialBasisStatus: "scope_confirmed",
        officialSourceCount: 2,
        reportedCaseCount: expect.any(Number),
        unresolvedConditionCount: 0
      })
    );
    expect(policyIds).toContain("eu261_regulation_261_2004");
    expect(result.scripts.map((script: { script_id: string }) => script.script_id)).toEqual([
      "eu261_claim_email_en",
      "eu261_authority_escalation_en"
    ]);
  });

  it("rejects incomplete facts with actionable missing fields", async () => {
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        facts: {
          ...emptyClaimFacts(),
          issueType: "denied_boarding",
          provider: "Delta"
        }
      })
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(422);
    expect(result.missingFields).toEqual(["origin", "deniedBoardingKind"]);
  });
});
