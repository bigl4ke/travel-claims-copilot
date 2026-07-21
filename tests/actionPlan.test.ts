import { describe, expect, it } from "vitest";

import casesJson from "../data/cases.json";
import policiesJson from "../data/policies.json";
import scriptsJson from "../data/scripts.json";
import { buildAnalysisFromFacts } from "../lib/analyze";
import { emptyClaimFacts, normalizeClaimFacts, type ClaimFacts } from "../lib/claimFacts";
import type { Case, Policy, Script } from "../lib/types";

const cases = casesJson as Case[];
const policies = policiesJson as Policy[];
const scripts = scriptsJson as Script[];

function analyze(overrides: Partial<ClaimFacts>) {
  const facts = normalizeClaimFacts({ ...emptyClaimFacts(), ...overrides });
  return buildAnalysisFromFacts(facts, policies, cases, scripts, "test conversation");
}

describe("action plan", () => {
  it("leads a US-origin United airport cancellation with restoration, not EU261", () => {
    const result = analyze({
      issueType: "airline_cancellation",
      providerType: "airline",
      provider: "United",
      operatingCarrier: "United",
      disruptingCarrier: "United",
      origin: { city: "Chicago", airport: "ORD", country: "United States", region: "US" },
      destination: { city: null, airport: null, country: "China", region: "CN" },
      disruptionType: "cancellation",
      disruptionReason: "unknown",
      disruptionReasonStatus: "unavailable",
      journeyStage: "at_airport",
      disruptionTiming: "close_in_irrops",
      recoveryPriorities: ["earliest_arrival"]
    });

    expect(result.actionPlan).toMatchObject({
      status: "actionable",
      situation: "close_in_irrops",
      contactNow: { role: "disrupting_airline", name: "United" },
      notGuaranteed: true
    });
    expect(result.actionPlan?.headline).toContain("restore your trip");
    expect(result.actionPlan?.primaryAsk).toContain("earliest reasonable onward itinerary");
    expect(result.actionPlan?.evidenceNow).toContain(
      "Any replacement itinerary offered and whether it is confirmed or waitlisted"
    );
    expect(result.actionPlan?.evidenceNow).not.toContain("Original payment method");
    expect(result.actionPlan?.sourceIds).not.toContain("eu261_regulation_261_2004");
    expect(result.actionPlan?.references.every((reference) => reference.url)).toBe(true);
  });

  it("links EU261 as an official reference for an Air France departure from Paris", () => {
    const result = analyze({
      issueType: "airline_delay",
      providerType: "airline",
      provider: "Air France",
      operatingCarrier: "Air France",
      origin: { city: "Paris", airport: "CDG", country: "France", region: "EU_EEA_CH" },
      destination: {
        city: "New York",
        airport: "JFK",
        country: "United States",
        region: "US"
      },
      disruptionType: "delay",
      disruptionReason: "late_inbound_aircraft",
      disruptionReasonStatus: "reported",
      arrivalDelayMinutes: 240,
      journeyStage: "completed"
    });

    expect(result.actionPlan?.references).toContainEqual(
      expect.objectContaining({
        id: "eu261_regulation_261_2004",
        kind: "official"
      })
    );
  });

  it("keeps hotel recovery first and excludes unrelated or synthetic references", () => {
    const result = analyze({
      issueType: "hotel_walk",
      providerType: "hotel",
      provider: "Marriott",
      disruptionType: "hotel_walk",
      bookingChannel: "direct",
      journeyStage: "en_route"
    });

    expect(result.actionPlan?.primaryAsk).toContain("comparable nearby room");
    const communityReferences =
      result.actionPlan?.references.filter((reference) => reference.kind === "community") ?? [];
    expect(result.actionPlan?.sourceIds).toContain("marriott_ultimate_reservation_guarantee");
    expect(communityReferences).toHaveLength(0);
    expect(communityReferences.some((reference) => /Hyatt|IHG/i.test(reference.title))).toBe(false);
  });

  it("does not invent an action when the servicing context is unresolved", () => {
    const result = analyze({
      issueType: "airline_cancellation",
      providerType: "airline",
      provider: "United",
      disruptionType: "cancellation",
      journeyStage: "unknown"
    });

    expect(result.actionPlan).toMatchObject({
      status: "needs_context",
      primaryAsk: null,
      contactNow: { role: "unknown" }
    });
  });
});
