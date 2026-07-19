import { describe, expect, it } from "vitest";

import { buildAnalysisFromFacts } from "../lib/analyze";
import { processClaimTurn, type ProcessClaimDependencies } from "../lib/claim-workflow";
import type { RawClaimFacts } from "../lib/domain/claim-contract";
import { createKnowledgeRepository } from "../lib/knowledge/knowledge-repository";
import { claimState, type DeepPartial } from "./fixtures/raw-claims";

const dependencies: ProcessClaimDependencies = {
  localExtractor: {
    provider: "local",
    model: null,
    async extract() {
      return { set: {} };
    }
  },
  knowledgeRepository: createKnowledgeRepository({ asOf: "2026-07-19" }),
  now: () => "2026-07-19"
};

function analyzeRoute(facts: DeepPartial<RawClaimFacts>) {
  const prior = claimState({
    incidentType: "airline_cancellation",
    providerType: "airline",
    reasonCategory: "mechanical",
    ...facts
  });
  return buildAnalysisFromFacts(
    { message: "No additional facts.", prior, baseRevision: prior.revision },
    dependencies
  );
}

describe("canonical regional policy applicability", () => {
  it("delegates buildAnalysisFromFacts to the canonical claim workflow", () => {
    expect(buildAnalysisFromFacts).toBe(processClaimTurn);
  });

  it("resolves route direction and keeps display ranking separate from applicability", async () => {
    const response = await analyzeRoute({
      operatingCarrier: "British Airways",
      origin: { airport: "JFK" },
      destination: { airport: "LHR" }
    });

    expect(response.context?.jurisdiction.originRegion.value).toBe("US");
    expect(response.context?.jurisdiction.destinationRegion.value).toBe("UK");
    expect(response.context?.jurisdiction.operatingCarrierRegion.value).toBe("UK");
    expect(response.result.retrieval.displayedPolicies.length).toBeGreaterThan(0);
    expect(response.result.retrieval.displayedPolicies.length).toBeLessThanOrEqual(3);
    expect(response.result.retrieval.displayedScripts.length).toBeGreaterThan(0);
    expect(response.result.retrieval.displayedScripts.length).toBeLessThanOrEqual(2);
  });

  it("applies UK261 to a UK departure through complete applicability", async () => {
    const response = await analyzeRoute({
      operatingCarrier: "British Airways",
      origin: { airport: "LHR" },
      destination: { airport: "JFK" }
    });
    const ukPolicy = response.result.retrieval.policyApplicability.find(
      ({ policy }) => policy.policy_id === "uk261_assimilated_regulation_261_2004"
    );

    expect(ukPolicy).toMatchObject({ status: "applicable" });
    expect(ukPolicy?.matchedConditions).toContain("scenario_matched");
    expect(response.result.legalRegimes).toContain("UK261");
  });

  it("excludes UK261 for inbound United service", async () => {
    const response = await analyzeRoute({
      operatingCarrier: "United",
      origin: { airport: "JFK" },
      destination: { airport: "LHR" }
    });
    const ukPolicies = response.result.retrieval.policyApplicability.filter(
      ({ policy }) => policy.legal_regime === "UK261"
    );

    expect(ukPolicies.every(({ status }) => status === "not_applicable")).toBe(true);
    expect(response.result.legalRegimes).not.toContain("UK261");
  });

  it("applies EU261 to an EU-carrier arrival but not a non-EU-carrier arrival", async () => {
    const euCarrier = await analyzeRoute({
      operatingCarrier: "Air France",
      origin: { airport: "JFK" },
      destination: { airport: "CDG" }
    });
    const nonEuCarrier = await analyzeRoute({
      operatingCarrier: "United",
      origin: { airport: "JFK" },
      destination: { airport: "CDG" }
    });

    expect(euCarrier.result.legalRegimes).toContain("EU261");
    expect(nonEuCarrier.result.legalRegimes).not.toContain("EU261");
  });

  it.each([
    [
      "CA_APPR",
      {
        operatingCarrier: "Air Canada",
        origin: { airport: "YYZ" },
        destination: { airport: "JFK" }
      }
    ],
    [
      "AU_ACL",
      { operatingCarrier: "Qantas", origin: { airport: "SYD" }, destination: { airport: "JFK" } }
    ],
    [
      "CN_FLIGHT_REGULATION",
      {
        operatingCarrier: "China Eastern Airlines",
        origin: { airport: "PVG" },
        destination: { airport: "JFK" }
      }
    ]
  ] as const)("keeps unmapped %s outside the four-scenario public build", async (regime, facts) => {
    const response = await analyzeRoute(facts);
    const assessments = response.result.retrieval.policyApplicability.filter(
      ({ policy }) => policy.legal_regime === regime
    );

    expect(assessments.length).toBeGreaterThan(0);
    assessments.forEach((assessment) => {
      expect(assessment.status).toBe("not_applicable");
      expect(assessment.exclusions).toContain("scenario_excluded");
    });
    expect(response.result.legalRegimes).not.toContain(regime);
  });

  it("does not apply China rules solely because a foreign carrier arrives in China", async () => {
    const response = await analyzeRoute({
      operatingCarrier: "United",
      origin: { airport: "LAX" },
      destination: { airport: "PVG" },
      reasonCategory: "weather"
    });

    expect(response.result.legalRegimes).toContain("US_DOT_REFUND");
    expect(response.result.legalRegimes).not.toContain("CN_FLIGHT_REGULATION");
  });
});
