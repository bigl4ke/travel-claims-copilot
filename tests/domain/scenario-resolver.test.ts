import { describe, expect, it } from "vitest";

import type { RawFactPath, RawClaimFacts } from "../../lib/domain/claim-contract";
import { resolveClaimContext } from "../../lib/domain/context-resolver";
import { claimState, rawFacts } from "../fixtures/raw-claims";

type ScenarioOverrides = Parameters<typeof rawFacts>[0];

function resolvedContext(overrides: ScenarioOverrides, unresolvedFields: RawFactPath[] = []) {
  return resolveClaimContext({
    state: claimState(overrides, 0, { unresolvedFields })
  });
}

describe("scenario set resolution", () => {
  it("activates EU/UK before US for a qualifying Paris to New York cancellation", () => {
    const context = resolvedContext({
      incidentType: "airline_cancellation",
      origin: { airport: "CDG" },
      destination: { airport: "JFK" },
      operatingCarrier: "Air France"
    });

    expect(context.scenarios.scenarioIds).toEqual([
      "eu_uk_air_disruption",
      "us_airline_disruption"
    ]);
    expect(context.scenarios.primaryScenario).toBe("eu_uk_air_disruption");
  });

  it("excludes inbound EU261 for a known non-EU carrier while retaining US coverage", () => {
    const context = resolvedContext({
      incidentType: "airline_delay",
      origin: { airport: "JFK" },
      destination: { airport: "CDG" },
      operatingCarrier: "United"
    });

    expect(context.jurisdiction.eu261.value).toBe("does_not_apply");
    expect(context.scenarios.status).toBe("resolved");
    expect(context.scenarios.scenarioIds).toEqual(["us_airline_disruption"]);
  });

  it("requires a US departure for denied boarding", () => {
    const usDeparture = resolvedContext({
      incidentType: "denied_boarding",
      origin: { airport: "JFK" }
    });
    const nonUsDeparture = resolvedContext({
      incidentType: "denied_boarding",
      origin: { airport: "CDG" }
    });
    const unknownDeparture = resolvedContext({ incidentType: "denied_boarding" });

    expect(usDeparture.scenarios.scenarioIds).toEqual(["us_denied_boarding"]);
    expect(nonUsDeparture.scenarios.status).toBe("out_of_scope");
    expect(unknownDeparture.scenarios.status).toBe("needs_information");
    expect(unknownDeparture.scenarios.missingFacts).toEqual(["origin.airport"]);
  });

  it("excludes non-Marriott hotel walks", () => {
    const context = resolvedContext({
      incidentType: "hotel_walk",
      provider: "Hyatt",
      confirmedHotelReservation: true,
      wasWalked: true
    });

    expect(context.scenarios.status).toBe("out_of_scope");
    expect(context.scenarios.decisions).toEqual([
      {
        scenarioId: "marriott_hotel_walk",
        status: "excluded",
        reasons: ["admission_rule_not_matched"],
        missingFacts: []
      }
    ]);
  });

  it("returns needs information for a route whose possible regimes are unknown", () => {
    const context = resolvedContext({
      incidentType: "airline_cancellation",
      provider: "Mystery Air"
    });

    expect(context.scenarios.status).toBe("needs_information");
    expect(context.scenarios.scenarioIds).toEqual([]);
    expect(context.scenarios.missingFacts).toEqual([
      "origin.airport",
      "destination.airport",
      "operatingCarrier"
    ]);
  });

  it("does not publish a partial set when US is active and inbound EU remains unresolved", () => {
    const context = resolvedContext({
      incidentType: "airline_cancellation",
      origin: { airport: "JFK" },
      destination: { airport: "CDG" },
      operatingCarrier: "Mystery Air"
    });

    expect(context.scenarios.status).toBe("needs_information");
    expect(context.scenarios.scenarioIds).toEqual([]);
    expect(context.scenarios.primaryScenario).toBeNull();
    expect(context.scenarios.decisions).toEqual([
      {
        scenarioId: "us_airline_disruption",
        status: "active",
        reasons: ["admission_rule_matched"],
        missingFacts: []
      },
      {
        scenarioId: "eu_uk_air_disruption",
        status: "unresolved",
        reasons: ["parallel_scenario_admission_unknown"],
        missingFacts: ["operatingCarrier"]
      }
    ]);
    expect(context.scenarios.missingFacts).toEqual(["operatingCarrier"]);
  });

  it("does not publish a partial set when EU/UK is active and US remains unresolved", () => {
    const context = resolvedContext({
      incidentType: "airline_delay",
      origin: { airport: "CDG" },
      operatingCarrier: "Air France"
    });

    expect(context.scenarios.status).toBe("needs_information");
    expect(context.scenarios.scenarioIds).toEqual([]);
    expect(
      context.scenarios.decisions.map(({ scenarioId, status }) => ({ scenarioId, status }))
    ).toEqual([
      { scenarioId: "eu_uk_air_disruption", status: "active" },
      { scenarioId: "us_airline_disruption", status: "unresolved" }
    ]);
    expect(context.scenarios.missingFacts).toEqual(["destination.airport"]);
  });

  it.each([
    ["confirmedHotelReservation", { confirmedHotelReservation: true, wasWalked: true }],
    ["wasWalked", { confirmedHotelReservation: true, wasWalked: true }]
  ] as const)("masks prior hotel admission fact %s", (path, overrides) => {
    const context = resolvedContext(
      {
        incidentType: "hotel_walk",
        provider: "Marriott",
        ...overrides
      },
      [path]
    );

    expect(context.scenarios.status).toBe("needs_information");
    expect(context.scenarios.missingFacts).toEqual([path]);
    expect(context.resolutionFacts[path]).toBeNull();
    expect(context.raw.facts[path]).toBe(true);
  });

  it("masks a prior route fact from admission while preserving it for fact review", () => {
    const context = resolvedContext(
      {
        incidentType: "denied_boarding",
        origin: { airport: "JFK" }
      },
      ["origin.airport"]
    );

    expect(context.scenarios.status).toBe("needs_information");
    expect(context.scenarios.missingFacts).toEqual(["origin.airport"]);
    expect(context.resolutionFacts.origin.airport).toBeNull();
    expect(context.raw.facts.origin.airport).toBe("JFK");
  });

  it("requires an incident type rather than declaring an unknown claim out of scope", () => {
    const context = resolvedContext({} as Partial<RawClaimFacts>);

    expect(context.scenarios.status).toBe("needs_information");
    expect(context.scenarios.missingFacts).toEqual(["incidentType"]);
  });
});
