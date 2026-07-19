import { describe, expect, it } from "vitest";

import {
  emptyClaimFacts,
  getMissingClaimFields,
  normalizeClaimFacts,
  parseClaimFacts
} from "../lib/claimFacts";
import { POST } from "../app/api/analyze/route";
import { assessEu261Candidate } from "../lib/jurisdiction";
import { claimState } from "./fixtures/raw-claims";

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
    expect(getMissingClaimFields(facts)).toEqual(["destination", "disruptionReason"]);
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
  it("analyzes canonical state without reclassifying prior facts", async () => {
    const prior = claimState({
      incidentType: "airline_cancellation",
      provider: "Air France",
      operatingCarrier: "Air France",
      origin: { city: "Paris", airport: "CDG" },
      destination: { city: "New York", airport: "JFK" },
      reasonCategory: "mechanical",
      finalArrivalDelayMinutes: 240
    });
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "No additional facts.",
        prior,
        baseRevision: prior.revision,
        requestedMode: "local"
      })
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.claimState.facts.incidentType).toBe("airline_cancellation");
    expect(result).not.toHaveProperty("context");
    expect(result.result.derivedContext.originRegion.value).toBe("EU_EEA_CH");
    expect(result.result.derivedContext.destinationRegion.value).toBe("US");
    expect(result.result.derivedContext.controllability.value).toBe("controllable");
    expect(result.result.derivedContext.legalRegimes).toEqual(
      expect.arrayContaining(["EU261", "US_DOT_REFUND"])
    );
  });

  it("keeps complete EU261 applicability even before display ranking", async () => {
    const prior = claimState({
      incidentType: "airline_cancellation",
      provider: "Air France",
      operatingCarrier: "Air France",
      origin: { airport: "CDG" },
      destination: { airport: "JFK" },
      reasonCategory: "late_inbound_aircraft",
      finalArrivalDelayMinutes: 240
    });
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "No additional facts.",
        prior,
        baseRevision: 0,
        requestedMode: "local"
      })
    });

    const response = await POST(request);
    const result = await response.json();
    const policyIds = result.result.policyApplicability
      .filter(({ status }: { status: string }) => status !== "not_applicable")
      .map(({ policyId }: { policyId: string }) => policyId);

    expect(response.status).toBe(200);
    expect(result.result.derivedContext.controllability.value).toBe("unknown");
    expect(policyIds).toContain("eu261_air_passenger_rights");
    expect(policyIds).toContain("eu261_regulation_261_2004");
    expect(result.result.officialSources.length).toBeGreaterThan(0);
    expect(result.result.scripts.length).toBeGreaterThan(0);
  });

  it("returns actionable missing facts for incomplete canonical state", async () => {
    const prior = claimState({
      incidentType: "denied_boarding",
      provider: "Delta"
    });
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "No additional facts.",
        prior,
        baseRevision: 0,
        requestedMode: "local"
      })
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.status).toBe("needs_information");
    expect(result.result.missingFacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "origin.airport" })])
    );
  });
});
