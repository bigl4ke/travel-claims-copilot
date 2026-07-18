import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, expectTypeOf, it } from "vitest";

import { emptyClaimFacts, parseClaimFacts } from "../../lib/claimFacts";
import { RAW_FACT_PATHS, type RawFactPath } from "../../lib/domain/claim-contract";
import {
  resolveClaimContext,
  resolveControllability,
  resolveKnownLocation,
  resolveLocationRegion,
  resolveOperatingCarrierRegion,
  resolveProvider
} from "../../lib/domain/context-resolver";
import {
  buildResolutionFacts,
  emptyRawClaimFacts,
  parseRawClaimFacts
} from "../../lib/domain/raw-fact-schema";
import {
  claimState,
  type DeepPartial,
  rawFacts,
  resolvedContext as fixtureResolvedContext
} from "../fixtures/raw-claims";

describe("raw fact schema", () => {
  it("declares the complete raw shape without derived authority", () => {
    const empty = emptyRawClaimFacts();

    expect(RAW_FACT_PATHS).toHaveLength(50);
    expect(empty).toEqual(rawFacts());
    expect(RAW_FACT_PATHS).not.toContain("origin.region");
    expect(RAW_FACT_PATHS).not.toContain("operatingCarrierRegion");
  });

  it("provides reusable fixture builders for later work packages", () => {
    const state = claimState({ incidentType: "airline_delay" }, 3, {
      unresolvedFields: ["origin.airport"]
    });

    expect(state.revision).toBe(3);
    expect(state.facts).toEqual(rawFacts({ incidentType: "airline_delay" }));
    expect(state.unresolvedFields).toEqual(["origin.airport"]);
    expect(fixtureResolvedContext({ incidentType: "hotel_walk" }).raw.facts).toEqual(
      rawFacts({ incidentType: "hotel_walk" })
    );
  });

  it("keeps array and tuple types intact in fixture deep partials", () => {
    type FixtureShape = {
      mutableItems: string[];
      readonlyItems: readonly string[];
      tuple: readonly [string, { nested: number }];
      object: { nested: number };
    };
    type ExpectedPartial = {
      mutableItems?: string[];
      readonlyItems?: readonly string[];
      tuple?: readonly [string, { nested: number }];
      object?: { nested?: number };
    };

    expectTypeOf<DeepPartial<FixtureShape>>().toEqualTypeOf<ExpectedPartial>();
  });

  it("builds fixture state without sharing supplied mutable authority", () => {
    const provenance = {
      provider: { source: "user_message" as const, factsRevision: 2 }
    };
    const conflicts = [
      {
        field: "provider" as const,
        candidates: [{ value: "United", source: "deterministic_extraction" as const }]
      }
    ];
    const unresolvedFields: RawFactPath[] = ["provider"];

    const state = claimState({}, 2, { provenance, conflicts, unresolvedFields });

    expect(state.provenance).not.toBe(provenance);
    expect(state.provenance.provider).not.toBe(provenance.provider);
    expect(state.conflicts).not.toBe(conflicts);
    expect(state.conflicts[0]).not.toBe(conflicts[0]);
    expect(state.conflicts[0]?.candidates).not.toBe(conflicts[0]?.candidates);
    expect(state.unresolvedFields).not.toBe(unresolvedFields);

    conflicts[0]?.candidates.push({
      value: "Delta",
      source: "deterministic_extraction"
    });
    unresolvedFields.push("operatingCarrier");
    expect(state.conflicts[0]?.candidates).toHaveLength(1);
    expect(state.unresolvedFields).toEqual(["provider"]);
  });

  it("ignores injected derived fields and recomputes the US route", () => {
    const base = rawFacts({
      incidentType: "airline_cancellation",
      origin: { airport: "JFK", country: "United States" },
      destination: { airport: "LAX", country: "United States" }
    });
    const input: unknown = {
      ...base,
      scenarioId: "eu_uk_air_disruption",
      origin: { ...base.origin, region: "EU_EEA_CH" },
      destination: { ...base.destination, region: "EU_EEA_CH" }
    };

    const parsed = parseRawClaimFacts(input);

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error(parsed.errors.join("; "));
    expect(parsed.data.origin).not.toHaveProperty("region");
    expect(parsed.data).not.toHaveProperty("scenarioId");

    const context = resolveClaimContext({ state: claimState(parsed.data) });
    expect(context.jurisdiction.originRegion.value).toBe("US");
    expect(context.jurisdiction.destinationRegion.value).toBe("US");
  });

  it("trims bounded values while preserving false, zero, and immutable deduplicated arrays", () => {
    const inputExpenses = [" taxi ", "taxi", "meal"];
    const input = rawFacts({
      provider: "  Air France  ",
      finalArrivalDelayMinutes: 0,
      isOvernight: false,
      assistance: { refundOffered: false },
      expenses: inputExpenses,
      evidence: [" receipt ", "receipt"]
    });

    const parsed = parseRawClaimFacts(input);

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error(parsed.errors.join("; "));
    expect(parsed.data.provider).toBe("Air France");
    expect(parsed.data.finalArrivalDelayMinutes).toBe(0);
    expect(parsed.data.isOvernight).toBe(false);
    expect(parsed.data.assistance.refundOffered).toBe(false);
    expect(parsed.data.expenses).toEqual(["taxi", "meal"]);
    expect(parsed.data.evidence).toEqual(["receipt"]);
    expect(parsed.data.expenses).not.toBe(inputExpenses);
    expect(inputExpenses).toEqual([" taxi ", "taxi", "meal"]);
  });

  it("returns every declared-value validation error", () => {
    const tooLong = "x".repeat(257);
    const input = rawFacts({
      providerType: "train" as "airline",
      provider: tooLong,
      finalArrivalDelayMinutes: -1,
      cancellationNoticeHours: 1.5,
      isOvernight: "yes" as unknown as boolean,
      expenses: Array.from({ length: 21 }, (_, index) => `expense-${index}`),
      userGoal: "g".repeat(501)
    });

    const parsed = parseRawClaimFacts(input);

    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("expected invalid raw facts");
    expect(parsed.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("providerType"),
        expect.stringContaining("provider"),
        expect.stringContaining("finalArrivalDelayMinutes"),
        expect.stringContaining("cancellationNoticeHours"),
        expect.stringContaining("isOvernight"),
        expect.stringContaining("expenses"),
        expect.stringContaining("userGoal")
      ])
    );
    expect(parsed.errors).toHaveLength(7);
  });

  it("accumulates array length and item errors without mutating the input", () => {
    const expenses: unknown[] = Array.from({ length: 20 }, (_, index) => `expense-${index}`);
    expenses.push(42);
    const originalExpenses = structuredClone(expenses);
    const input: unknown = { ...rawFacts(), expenses };

    const parsed = parseRawClaimFacts(input);

    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("expected invalid raw facts");
    expect(parsed.errors.filter((error) => error.startsWith("expenses"))).toEqual([
      "expenses must contain at most 20 items",
      "expenses items must be strings of at most 256 Unicode code points"
    ]);
    expect(expenses).toEqual(originalExpenses);
  });
});

describe("resolution fact mask", () => {
  it("masks every unresolved value category in a fresh copy without changing prior state", () => {
    const facts = rawFacts({
      provider: "Marriott",
      brandOrProperty: "Sheraton",
      operatingCarrier: "Air France",
      origin: { city: "Paris", airport: "CDG" },
      statedReason: "mechanical issue",
      reasonCategory: "mechanical",
      finalArrivalDelayMinutes: 0,
      assistance: { refundAccepted: false },
      expenses: ["taxi"],
      evidence: ["receipt"]
    });
    const unresolvedFields: RawFactPath[] = [
      "provider",
      "brandOrProperty",
      "operatingCarrier",
      "origin.city",
      "origin.airport",
      "statedReason",
      "reasonCategory",
      "finalArrivalDelayMinutes",
      "assistance.refundAccepted",
      "expenses",
      "evidence"
    ];
    const state = claimState(facts, 0, { unresolvedFields });

    const masked = buildResolutionFacts(state);

    expect(masked.provider).toBeNull();
    expect(masked.brandOrProperty).toBeNull();
    expect(masked.operatingCarrier).toBeNull();
    expect(masked.origin.city).toBeNull();
    expect(masked.origin.airport).toBeNull();
    expect(masked.statedReason).toBeNull();
    expect(masked.reasonCategory).toBeNull();
    expect(masked.finalArrivalDelayMinutes).toBeNull();
    expect(masked.assistance.refundAccepted).toBeNull();
    expect(masked.expenses).toEqual([]);
    expect(masked.evidence).toEqual([]);
    expect(masked.expenses).not.toBe(facts.expenses);
    expect(masked.evidence).not.toBe(facts.evidence);
    expect(state.facts).toEqual(facts);
    expect(state.facts.origin.airport).toBe("CDG");
    expect(state.facts.assistance.refundAccepted).toBe(false);
  });

  it("rejects runtime-invalid unresolved paths", () => {
    const state = claimState({}, 0, {
      unresolvedFields: ["origin.region" as RawFactPath]
    });

    expect(() => buildResolutionFacts(state)).toThrowError("invalid_raw_fact_path");
  });
});

describe("server-owned context", () => {
  it("uses airport before conflicting country and keeps unknown locations unresolved", () => {
    expect(resolveLocationRegion({ city: null, airport: "JFK", country: "France" }).value).toBe(
      "US"
    );
    expect(
      resolveLocationRegion({ city: "Atlantis", airport: null, country: null }).value
    ).toBeNull();
  });

  it("preserves country aliases and falls through unknown stronger fields", () => {
    expect(resolveLocationRegion({ city: null, airport: null, country: "USA" }).value).toBe("US");
    expect(resolveLocationRegion({ city: null, airport: null, country: "中国" }).value).toBe("CN");
    expect(resolveKnownLocation({ city: "Paris", airport: "UNKNOWN", country: null }).country).toBe(
      "France"
    );
  });

  it("normalizes provider and actual carrier independently without provider fallback", () => {
    const withCarrier = resolveClaimContext({
      state: claimState(
        rawFacts({ provider: "Sheraton", operatingCarrier: "KLM", incidentType: "hotel_walk" })
      )
    });
    const withoutCarrier = resolveClaimContext({
      state: claimState(rawFacts({ provider: "United", incidentType: "airline_cancellation" }))
    });

    expect(withCarrier.normalizedProvider.value).toBe("Marriott");
    expect(withCarrier.normalizedOperatingCarrier.value).toBe("KLM");
    expect(withCarrier.jurisdiction.operatingCarrierRegion.value).toBe("EU_EEA_CH");
    expect(withoutCarrier.normalizedOperatingCarrier.value).toBeNull();
    expect(withoutCarrier.jurisdiction.operatingCarrierRegion.value).toBeNull();
    expect(resolveProvider("   ", null, null).value).toBeNull();
  });

  it.each([
    ["Air France", "EU_EEA_CH"],
    ["KLM", "EU_EEA_CH"],
    ["Lufthansa", "EU_EEA_CH"],
    ["ITA Airways", "EU_EEA_CH"],
    ["Iberia", "EU_EEA_CH"],
    ["Aer Lingus", "EU_EEA_CH"],
    ["SAS", "EU_EEA_CH"],
    ["Finnair", "EU_EEA_CH"],
    ["TAP Air Portugal", "EU_EEA_CH"],
    ["Austrian Airlines", "EU_EEA_CH"],
    ["SWISS", "EU_EEA_CH"],
    ["British Airways", "UK"],
    ["Virgin Atlantic", "UK"],
    ["easyJet", "UK"],
    ["Jet2", "UK"],
    ["TUI Airways", "UK"],
    ["Wizz Air UK", "UK"],
    ["Air China", "CN"],
    ["China Eastern Airlines", "CN"],
    ["China Southern Airlines", "CN"],
    ["Hainan Airlines", "CN"],
    ["XiamenAir", "CN"],
    ["Sichuan Airlines", "CN"],
    ["Spring Airlines", "CN"]
  ] as const)("preserves the legacy carrier registry for %s", (carrier, region) => {
    expect(resolveOperatingCarrierRegion(carrier).value).toBe(region);
  });

  it.each([
    ["crew", "controllable"],
    ["mechanical", "controllable"],
    ["other_controllable", "controllable"],
    ["weather", "uncontrollable"],
    ["other_uncontrollable", "uncontrollable"],
    ["late_inbound_aircraft", "unknown"],
    [null, "unknown"]
  ] as const)("resolves %s to %s controllability", (reason, expected) => {
    expect(resolveControllability(reason).value).toBe(expected);
  });

  it.each([
    ["eu261", "CDG"],
    ["uk261", "LHR"]
  ] as const)(
    "keeps %s unresolved when a qualifying destination and nonmatching carrier have an unknown origin",
    (applicability, destinationAirport) => {
      const context = fixtureResolvedContext({
        incidentType: "airline_cancellation",
        destination: { airport: destinationAirport },
        operatingCarrier: "United"
      });

      expect(context.jurisdiction[applicability].value).toBe("unknown");
      expect(context.scenarios.status).toBe("needs_information");
      expect(context.scenarios.scenarioIds).toEqual([]);
      expect(context.scenarios.missingFacts).toEqual(["origin.airport"]);
    }
  );

  it("projects canonical regions through the legacy parser instead of trusting injections", () => {
    const legacy = {
      ...emptyClaimFacts(),
      issueType: "airline_cancellation",
      providerType: "airline",
      provider: "United",
      operatingCarrier: null,
      operatingCarrierRegion: "EU_EEA_CH",
      origin: {
        city: null,
        airport: "JFK",
        country: "United States",
        region: "EU_EEA_CH"
      },
      destination: {
        city: null,
        airport: "LAX",
        country: "United States",
        region: "EU_EEA_CH"
      },
      disruptionType: "cancellation",
      disruptionReason: "mechanical",
      confidence: "high"
    };

    const parsed = parseClaimFacts(legacy);

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error(parsed.errors.join("; "));
    expect(parsed.data.origin.region).toBe("US");
    expect(parsed.data.destination.region).toBe("US");
    expect(parsed.data.operatingCarrierRegion).toBeNull();
    expect(parsed.data.operatingCarrier).toBeNull();
  });

  it("builds the resolution copy once and never reads stored facts for eligibility", () => {
    const contextSource = readFileSync(
      fileURLToPath(new URL("../../lib/domain/context-resolver.ts", import.meta.url)),
      "utf8"
    );
    const scenarioSource = readFileSync(
      fileURLToPath(new URL("../../lib/domain/scenario-resolver.ts", import.meta.url)),
      "utf8"
    );
    const maskCalls = contextSource.match(/buildResolutionFacts\(input\.state\)/g) ?? [];

    expect(maskCalls).toHaveLength(1);
    expect(contextSource).not.toMatch(/(?:input\.state|context\.raw|input\.raw)\.facts/);
    expect(scenarioSource).not.toMatch(/(?:input\.state|context\.raw|input\.raw)\.facts/);
  });

  it("keeps canonical registries independent from compatibility facades", () => {
    const canonicalSource = readFileSync(
      fileURLToPath(new URL("../../lib/domain/context-resolver.ts", import.meta.url)),
      "utf8"
    );

    expect(canonicalSource).not.toMatch(/from ["']\.\.\/(?:jurisdiction|provider|policyScope)["']/);
  });
});
