import { describe, expect, it } from "vitest";

import { resolveClaimContext } from "../../lib/domain/context-resolver";
import {
  assessPolicyApplicability,
  buildRetrievalTrace,
  regimesFromApplicability
} from "../../lib/domain/policy-applicability";
import {
  rankApplicablePolicies,
  caseComparabilityKey,
  rankCases,
  rankScripts,
  scenariosForIncident
} from "../../lib/retrievalScoring";
import { resolveRetrievalLimits } from "../../lib/retrieval-limits";
import type { Case, Policy, Script } from "../../lib/types";
import { claimState } from "../fixtures/raw-claims";
import { knowledgeSnapshotFixture, policyFixture } from "../fixtures/knowledge";
import { runWorkflowFixture } from "../fixtures/workflow";

function contextFor(overrides: Parameters<typeof claimState>[0] = {}) {
  return resolveClaimContext({
    state: claimState({
      incidentType: "airline_cancellation",
      providerType: "airline",
      operatingCarrier: "Air France",
      origin: { airport: "CDG" },
      destination: { airport: "JFK" },
      reasonCategory: "mechanical",
      ...overrides
    })
  });
}

function caseFixture(overrides: Partial<Case> = {}): Case {
  return {
    case_id: "case",
    source_type: "community_dp",
    source_name: "Community report",
    source_url: "https://example.test/case",
    provider_type: "airline",
    provider: "Air France",
    brand_or_airline: "Air France",
    issue_type: "airline_cancellation",
    location_country: "France",
    booking_channel: "direct",
    loyalty_status: "none",
    reservation_type: "paid",
    facts: "Carrier cancellation.",
    requested_compensation: [],
    actual_outcome: "Refund.",
    evidence_used: [],
    escalation_path: [],
    reusable_lesson: "Keep receipts.",
    confidence: "high",
    notes: "",
    review_status: "approved",
    review_notes: [],
    ...overrides
  };
}

function scriptFixture(overrides: Partial<Script> = {}): Script {
  return {
    script_id: "script",
    source_ids: ["eu-a"],
    incident_types: ["airline_cancellation"],
    applicable_regions: ["EU_EEA_CH"],
    applicability_rule: "eu261_route",
    required_controllability: "any",
    provider: "European Union",
    channel: "email",
    tone: "polite",
    language: "en",
    template: "Please review this claim.",
    when_to_use: "After a cancellation.",
    ...overrides
  };
}

describe("applicability-first retrieval ranking", () => {
  it("keeps four applicable policies when display limit is three", () => {
    const context = contextFor({ destination: { airport: "JFK" } });
    const policies: Policy[] = [
      policyFixture({
        policy_id: "eu-a",
        policy_name: "EU A",
        provider: "European Union",
        legal_regime: "EU261",
        applicability_rule: "eu261_route",
        incident_types: ["airline_cancellation"],
        applicable_regions: ["EU_EEA_CH"]
      }),
      policyFixture({
        policy_id: "eu-b",
        policy_name: "EU B",
        provider: "European Union",
        legal_regime: "EU261",
        applicability_rule: "eu261_route",
        incident_types: ["airline_cancellation"],
        applicable_regions: ["EU_EEA_CH"]
      }),
      policyFixture({
        policy_id: "us-a",
        policy_name: "US A",
        provider: "US DOT",
        legal_regime: "US_DOT_REFUND",
        applicability_rule: "origin_or_destination_region",
        incident_types: ["airline_cancellation"],
        applicable_regions: ["US"]
      }),
      policyFixture({
        policy_id: "us-b",
        policy_name: "US B",
        provider: "US DOT",
        legal_regime: "US_DOT_REFUND",
        applicability_rule: "origin_or_destination_region",
        incident_types: ["airline_cancellation"],
        applicable_regions: ["US"]
      })
    ];
    const assessment = assessPolicyApplicability(context, policies);

    expect(assessment.filter(({ status }) => status !== "not_applicable")).toHaveLength(4);
    expect(rankApplicablePolicies(context, assessment, 3)).toHaveLength(3);
    expect(regimesFromApplicability(assessment)).toEqual(["EU261", "US_DOT_REFUND"]);
  });

  it("preserves reasons and ranks a comparable real case before synthetic", () => {
    const context = contextFor({
      operatingCarrier: "United",
      origin: { airport: "JFK" },
      destination: { airport: "LAX" }
    });
    const ranked = rankCases(
      context,
      [
        caseFixture({
          case_id: "real",
          provider: "United",
          brand_or_airline: "United",
          location_country: "United States"
        }),
        caseFixture({
          case_id: "synthetic",
          source_type: "synthetic_example",
          source_name: "Synthetic example",
          source_url: "",
          provider: "United",
          brand_or_airline: "United",
          location_country: "United States"
        })
      ],
      3
    );

    expect(ranked.map(({ item }) => item.source_type)).toEqual([
      "community_dp",
      "synthetic_example"
    ]);
    expect(ranked[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("falls back to a disclosure-valid synthetic case when no real comparable case exists", () => {
    const context = contextFor({
      operatingCarrier: "United",
      origin: { airport: "JFK" },
      destination: { airport: "LAX" }
    });
    const ranked = rankCases(
      context,
      [
        caseFixture({
          case_id: "synthetic-only",
          source_type: "synthetic_example",
          source_name: "Synthetic United cancellation example",
          source_url: "",
          provider: "United",
          brand_or_airline: "United",
          location_country: "United States"
        })
      ],
      1
    );

    expect(ranked.map(({ item }) => item.case_id)).toEqual(["synthetic-only"]);
    expect(ranked[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("fails closed for dormant, unapproved, invalid-disclosure, and cross-provider cases", () => {
    const context = contextFor({
      operatingCarrier: "United",
      origin: { airport: "JFK" },
      destination: { airport: "LAX" }
    });
    expect(
      rankCases(
        context,
        [
          caseFixture({
            case_id: "dormant",
            issue_type: "eu261_delay_or_cancellation",
            provider: "United",
            brand_or_airline: "United"
          }),
          caseFixture({
            case_id: "pending",
            review_status: "needs_review",
            provider: "United",
            brand_or_airline: "United"
          }),
          caseFixture({
            case_id: "invalid",
            source_name: "Synthetic data",
            provider: "United",
            brand_or_airline: "United"
          }),
          caseFixture({ case_id: "other", provider: "Delta", brand_or_airline: "Delta" })
        ],
        3
      )
    ).toEqual([]);
  });

  it("maps only canonical and accepted legacy incidents, using the context's first active intersection", () => {
    const canonical = caseFixture({ case_id: "canonical", provider: "Generic US airline" });
    const euOnlyContext = contextFor({ destination: { airport: "FRA" } });
    const dualScenarioContext = contextFor();
    const usContext = contextFor({
      operatingCarrier: "United",
      origin: { airport: "JFK" },
      destination: { airport: "LAX" }
    });

    expect(scenariosForIncident("controllable_airline_cancellation")).toEqual([
      "us_airline_disruption",
      "eu_uk_air_disruption"
    ]);
    expect(scenariosForIncident("eu261_delay_or_cancellation")).toEqual([]);
    expect(rankCases(euOnlyContext, [canonical], 1)[0]?.item.case_id).toBe("canonical");
    expect(rankCases(usContext, [canonical], 1)[0]?.item.case_id).toBe("canonical");
    expect(caseComparabilityKey(dualScenarioContext, canonical)).toBe(
      `${dualScenarioContext.scenarios.scenarioIds[0]}:any`
    );
  });

  it("uses relevance across keys but source tier inside one comparable pool", () => {
    const context = contextFor({
      operatingCarrier: "United",
      origin: { airport: "JFK" },
      destination: { airport: "LAX" }
    });
    const genericReal = caseFixture({
      case_id: "generic-real",
      provider: "Generic US airline",
      brand_or_airline: "Generic US airline",
      location_country: "United States"
    });
    const exactSynthetic = caseFixture({
      case_id: "exact-synthetic",
      source_type: "synthetic_example",
      source_name: "Synthetic United example",
      source_url: "",
      provider: "United",
      brand_or_airline: "United",
      location_country: "United States"
    });
    const sameKeyReal = caseFixture({
      case_id: "same-key-real",
      provider: "United",
      brand_or_airline: "United",
      location_country: "United States"
    });

    expect(rankCases(context, [genericReal, exactSynthetic], 2)[0]?.item.case_id).toBe(
      "exact-synthetic"
    );
    expect(
      rankCases(context, [sameKeyReal, exactSynthetic], 2).map(({ item }) => item.case_id)
    ).toEqual(["same-key-real", "exact-synthetic"]);
  });

  it("allows an unknown provider only when its normalized name matches exactly", () => {
    const acmeContext = contextFor({
      operatingCarrier: "Acme Air",
      origin: { airport: "JFK" },
      destination: { airport: "LAX" }
    });
    expect(
      rankCases(acmeContext, [caseFixture({ case_id: "same", provider: "Acme Air" })], 1)[0]?.item
        .case_id
    ).toBe("same");
    expect(
      rankCases(acmeContext, [caseFixture({ case_id: "different", provider: "Other Air" })], 1)
    ).toEqual([]);
  });

  it("uses the operating carrier for canonical provider relevance", () => {
    const context = contextFor({
      provider: "Expedia",
      operatingCarrier: "United",
      origin: { airport: "JFK" },
      destination: { airport: "LAX" }
    });
    const ranked = rankCases(
      context,
      [
        caseFixture({ case_id: "generic", provider: "Generic US airline" }),
        caseFixture({
          case_id: "united",
          source_type: "synthetic_example",
          source_name: "Synthetic United example",
          source_url: "",
          provider: "United"
        })
      ],
      2
    );
    expect(ranked[0]?.item.case_id).toBe("united");
    expect(ranked[0]?.reasons).toContain("provider_exact_match");
  });

  it("keeps scripts only when every frozen citation is admissible and does not slice citations", () => {
    const context = contextFor({ destination: { airport: "FRA" }, reasonCategory: null });
    const policies = [
      policyFixture({
        policy_id: "eu-a",
        legal_regime: "EU261",
        applicability_rule: "eu261_route",
        applicable_regions: ["EU_EEA_CH"]
      }),
      policyFixture({
        policy_id: "conditional",
        legal_regime: "EU261",
        applicability_rule: "eu261_route",
        applicable_regions: ["EU_EEA_CH"],
        required_controllability: "controllable"
      }),
      policyFixture({
        policy_id: "blocked",
        legal_regime: "UK261",
        applicability_rule: "uk261_route",
        applicable_regions: ["UK"]
      })
    ];
    const trace = buildRetrievalTrace(
      context,
      knowledgeSnapshotFixture({
        policies,
        scripts: [
          scriptFixture({ script_id: "valid", source_ids: ["conditional", "eu-a"] }),
          scriptFixture({ script_id: "blocked", source_ids: ["eu-a", "blocked"] }),
          scriptFixture({ script_id: "missing", source_ids: ["eu-a", "not-a-policy"] })
        ]
      }),
      { policyLimit: 0, caseLimit: 0, scriptLimit: 3 }
    );

    expect(trace.displayedPolicies).toEqual([]);
    expect(trace.displayedScripts.map(({ item }) => item.script_id)).toEqual(["valid"]);
    expect(trace.displayedScripts[0]?.item.source_ids).toEqual(["conditional", "eu-a"]);
  });

  it("uses a complete trace for canonical regimes even with display limits", () => {
    const context = contextFor();
    const knowledge = knowledgeSnapshotFixture({
      policies: [
        policyFixture({
          policy_id: "eu-a",
          legal_regime: "EU261",
          applicability_rule: "eu261_route",
          applicable_regions: ["EU_EEA_CH"]
        }),
        policyFixture({
          policy_id: "us-a",
          legal_regime: "US_DOT_REFUND",
          applicability_rule: "origin_or_destination_region",
          applicable_regions: ["US"]
        })
      ]
    });
    const full = buildRetrievalTrace(context, knowledge, {
      policyLimit: 3,
      caseLimit: 3,
      scriptLimit: 2
    });
    const hidden = buildRetrievalTrace(context, knowledge, {
      policyLimit: 0,
      caseLimit: 0,
      scriptLimit: 0
    });

    expect(regimesFromApplicability(hidden.policyApplicability)).toEqual(
      regimesFromApplicability(full.policyApplicability)
    );
    expect(hidden.policyApplicability).toEqual(full.policyApplicability);
    expect(rankScripts(context, [], new Set(), 0)).toEqual([]);
  });

  it("does not let retrieval limits change workflow authority and rejects invalid limits", async () => {
    const policy = policyFixture({
      policy_id: "us-policy",
      provider: "US DOT",
      legal_regime: "US_DOT_REFUND",
      applicability_rule: "origin_or_destination_region",
      applicable_regions: ["US"],
      incident_types: ["airline_cancellation"]
    });
    const knowledge = {
      policies: [policy],
      cases: [
        caseFixture({
          case_id: "workflow-case",
          provider: "United",
          brand_or_airline: "United",
          location_country: "United States"
        })
      ],
      scripts: [
        scriptFixture({
          script_id: "workflow-script",
          source_ids: ["us-policy"],
          applicable_regions: ["US"],
          applicability_rule: "origin_or_destination_region",
          provider: "Generic US airline"
        })
      ]
    };
    const full = await runWorkflowFixture({ knowledge });
    const hidden = await runWorkflowFixture({ knowledge, retrievalLimits: { policyLimit: 0 } });

    expect(full.result.retrieval.policyApplicability).not.toEqual([]);
    expect(full.result.retrieval.displayedPolicies).not.toEqual([]);
    expect(full.result.legalRegimes).not.toEqual([]);
    expect(full.result.assessments).not.toEqual([]);

    expect(hidden.claimState).toEqual(full.claimState);
    expect(hidden.result.scenarioIds).toEqual(full.result.scenarioIds);
    expect(hidden.result.assessments).toEqual(full.result.assessments);
    expect(hidden.result.legalRegimes).toEqual(full.result.legalRegimes);
    expect(hidden.result.retrieval.policyApplicability).toEqual(
      full.result.retrieval.policyApplicability
    );
    expect(hidden.result.retrieval.displayedPolicies).toEqual([]);
    expect(hidden.result.retrieval.displayedCases).toEqual(full.result.retrieval.displayedCases);
    expect(hidden.result.retrieval.displayedScripts).toEqual(
      full.result.retrieval.displayedScripts
    );
    expect(hidden.result.retrieval.displayedScripts[0]?.item.source_ids).toEqual(["us-policy"]);
    expect(() => resolveRetrievalLimits({ policyLimit: -1 })).toThrow(RangeError);
    expect(() => resolveRetrievalLimits({ caseLimit: 1.5 })).toThrow(RangeError);
    expect(() => resolveRetrievalLimits({ scriptLimit: Number.NaN })).toThrow(RangeError);
    expect(() => rankCases(contextFor(), [], -1)).toThrow(RangeError);
  });
});
