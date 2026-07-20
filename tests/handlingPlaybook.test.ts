import { describe, expect, it } from "vitest";

import { emptyClaimFacts, normalizeClaimFacts, type ClaimFacts } from "../lib/claimFacts";
import { buildHandlingPlaybook } from "../lib/handlingPlaybook";

function airlineFacts(overrides: Partial<ClaimFacts> = {}): ClaimFacts {
  return normalizeClaimFacts({
    ...emptyClaimFacts(),
    issueType: "airline_cancellation",
    providerType: "airline",
    provider: "Air France",
    operatingCarrier: "Air France",
    origin: {
      city: "Paris",
      airport: "CDG",
      country: "France",
      region: "EU_EEA_CH"
    },
    destination: {
      city: "New York",
      airport: "JFK",
      country: "United States",
      region: "US"
    },
    disruptionType: "cancellation",
    disruptionReason: "unknown",
    disruptionReasonStatus: "unavailable",
    ...overrides
  });
}

describe("handling playbook", () => {
  it("routes an advance direct booking to the ticketing airline", () => {
    const playbook = buildHandlingPlaybook(
      airlineFacts({
        validatingCarrier: "Air France",
        bookingChannel: "direct",
        bookingProvider: "Air France",
        journeyStage: "pre_trip",
        disruptionTiming: "planned_schedule_change",
        ticketType: "cash",
        autoRebooked: true,
        recoveryPriorities: ["same_date", "nonstop"],
        preferredAlternatives: ["AF007"]
      })
    );

    expect(playbook).toMatchObject({
      status: "actionable",
      situation: "planned_schedule_change",
      contactFirst: {
        role: "ticketing_airline",
        name: "Air France"
      },
      notGuaranteed: true
    });
    expect(playbook.askLadder[0]).toContain("AF007");
    expect(playbook.ticketingChecks).toContain(
      "Ask the ticketing party to confirm the electronic ticket was revalidated or reissued for the new flight."
    );
  });

  it("routes an advance OTA booking back to the named booking provider", () => {
    const playbook = buildHandlingPlaybook(
      airlineFacts({
        bookingChannel: "ota",
        bookingProvider: "Expedia",
        journeyStage: "pre_trip",
        disruptionTiming: "planned_schedule_change",
        ticketType: "cash",
        autoRebooked: false
      })
    );

    expect(playbook.contactFirst).toMatchObject({
      role: "ticketing_agent",
      name: "Expedia"
    });
  });

  it("routes an advance partner award to the issuing frequent-flyer program", () => {
    const playbook = buildHandlingPlaybook(
      airlineFacts({
        provider: "Japan Airlines",
        operatingCarrier: "Japan Airlines",
        validatingCarrier: "Alaska Airlines",
        bookingChannel: "direct",
        journeyStage: "pre_trip",
        disruptionTiming: "planned_schedule_change",
        ticketType: "award",
        awardProgram: "Alaska Mileage Plan",
        autoRebooked: false
      })
    );

    expect(playbook.contactFirst).toMatchObject({
      role: "frequent_flyer_program",
      name: "Alaska Mileage Plan"
    });
    expect(playbook.fallback.join(" ")).toContain("partner award");
  });

  it("routes an airport IRROPS to the disrupting airline without requiring ticket ownership", () => {
    const playbook = buildHandlingPlaybook(
      airlineFacts({
        disruptingCarrier: "Air France",
        bookingChannel: "unknown",
        journeyStage: "at_airport",
        disruptionTiming: "close_in_irrops",
        ticketType: "unknown"
      })
    );

    expect(playbook).toMatchObject({
      status: "actionable",
      situation: "close_in_irrops",
      contactFirst: {
        role: "disrupting_airline",
        name: "Air France"
      }
    });
    expect(playbook.sources.map((source) => source.sourceType)).toEqual([
      "industry_guidance",
      "community_guide",
      "official_policy_required"
    ]);
  });

  it("routes a completed trip to written customer relations rather than rebooking", () => {
    const playbook = buildHandlingPlaybook(
      airlineFacts({
        journeyStage: "completed",
        disruptionTiming: "close_in_irrops",
        arrivalDelayMinutes: 240
      })
    );

    expect(playbook).toMatchObject({
      situation: "completed_disruption",
      contactFirst: {
        role: "airline_customer_relations",
        name: "Air France"
      },
      ticketingChecks: []
    });
    expect(playbook.askLadder.join(" ")).toContain("documented necessary expenses");
  });

  it("keeps hotel recovery separate from airline ticketing", () => {
    const playbook = buildHandlingPlaybook(
      normalizeClaimFacts({
        ...emptyClaimFacts(),
        issueType: "hotel_walk",
        providerType: "hotel",
        provider: "Marriott"
      })
    );

    expect(playbook).toMatchObject({
      situation: "hotel_walk",
      contactFirst: { role: "hotel_front_desk", name: "Marriott" },
      ticketingChecks: []
    });
  });
});
