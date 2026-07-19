import { describe, expect, it } from "vitest";

import { buildAnalysisViewModel, type AnalysisPresentationInput } from "../lib/analysis-view-model";
import {
  euCancellationFixture,
  presentationFixture,
  sourceTransparencyFixture,
  syntheticOnlyFixture
} from "./fixtures/analysis-view-model";
import {
  analyzeResponseFixture,
  localRequest,
  okAnalyzeResponse
} from "./fixtures/analyze-transport";

function blockedFixture(): AnalysisPresentationInput {
  const input = presentationFixture();
  input.context = null;
  input.assessment = {
    ...input.assessment,
    status: "out_of_scope",
    primaryScenario: null,
    scenarioIds: [],
    factsUsed: [],
    missingFacts: [],
    legalRegimes: [],
    assessments: [],
    retrieval: {
      policyApplicability: [],
      displayedPolicies: [],
      displayedCases: [],
      displayedScripts: []
    },
    nextActions: []
  };
  return input;
}

describe("analysis view model", () => {
  it("preserves source provenance while hiding internal scores", () => {
    const view = buildAnalysisViewModel(presentationFixture());

    expect(view.officialSources[0]).toMatchObject({
      category: "government_regulation",
      authority: "high",
      conditions: expect.any(Array),
      lastChecked: "2026-07-16"
    });
    expect(view.providerCommitments[0]).toMatchObject({
      category: "provider_commitment",
      applicableCarrier: "United"
    });
    expect(
      view.providerCommitments.find(({ commitmentId }) => commitmentId !== null)
    ).toMatchObject({
      commitmentId: "united-reviewed-commitment",
      rankingReasons: ["Matched operating carrier"]
    });
    expect(JSON.stringify(view.providerCommitments)).not.toContain("operating_carrier");
    expect(view.similarCases.map(({ category }) => category)).toEqual([
      "community_report",
      "user_report",
      "synthetic_example"
    ]);
    expect(view.factsUsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "incidentType",
          provenance: { source: "deterministic_extraction", factsRevision: 1 }
        })
      ])
    );
    expect(view.missingFacts).toContainEqual({
      path: "isOvernight",
      label: "isOvernight",
      reason: "Conflicting extractor values must be resolved.",
      material: true,
      scenarioIds: ["us_airline_disruption"]
    });
    expect(view.similarCases[0]).toMatchObject({
      url: "https://example.test/community-case",
      outcomeComplete: true,
      reviewNotes: ["Outcome is supported by the report."]
    });
    expect(view.similarCases[1].outcomeComplete).toBe(false);
    expect(view.similarCases[2]).toMatchObject({ url: null, outcomeComplete: false });
    expect(view.extraction).toEqual({
      performed: true,
      requestedMode: "local",
      provider: "local",
      model: null
    });
    expect(view.summary).toBe(
      "More information is needed before every material condition can be assessed."
    );
    expect(view.nextActions).toEqual([
      {
        title: "Next action",
        detail: "Confirm whether the disruption required an overnight stay."
      }
    ]);
    expect(view.disclaimer).toBe(
      "Informational guidance only — not legal advice or a promise of compensation."
    );
    expect(view.officialSources[0].rankingReasons).toEqual([
      "Exact issue match",
      "Authority match"
    ]);
    expect(JSON.stringify(view)).not.toContain('"score"');
  });

  it("keeps complete applicability and promotes a cited policy omitted by Top-K", () => {
    const input = presentationFixture();
    const displayedIds = input.assessment.retrieval.displayedPolicies.map(
      ({ item }) => item.policy_id
    );
    const view = buildAnalysisViewModel(input);

    expect(displayedIds).not.toContain("united-policy");
    expect(view.policyApplicability.map(({ policyId, status }) => [policyId, status])).toEqual([
      ["eu-regulation", "applicable"],
      ["dot-guidance", "conditional"],
      ["united-policy", "applicable"],
      ["uk-excluded", "not_applicable"]
    ]);
    expect(JSON.stringify(view.policyApplicability)).not.toContain('"score"');
    expect(view.scripts).toEqual([
      expect.objectContaining({
        title: "Use after a controllable United cancellation with documented expenses.",
        sourceIds: ["united-policy"]
      })
    ]);
    const promoted = view.providerCommitments.find(({ id }) => id === "united-policy");
    expect(promoted).toMatchObject({ rankingReasons: [] });
    view.scripts
      .flatMap(({ sourceIds }) => sourceIds)
      .forEach((sourceId) => {
        expect(
          [...view.officialSources, ...view.providerCommitments].filter(({ id }) => id === sourceId)
        ).toHaveLength(1);
      });
  });

  it("treats an isolated incomplete-result marker as an incomplete case outcome", () => {
    const input = presentationFixture();
    const caseItem = input.assessment.retrieval.displayedCases[0].item;
    caseItem.actual_outcome = "Result incomplete.";
    caseItem.review_notes = [];

    expect(buildAnalysisViewModel(input).similarCases[0].outcomeComplete).toBe(false);
  });

  it.each([
    ["empty", []],
    ["duplicate", ["united-policy", "united-policy"]],
    ["unknown", ["unknown-policy"]],
    ["not applicable", ["uk-excluded"]]
  ] as const)("rejects %s script policy references", (_label, sourceIds) => {
    const input = presentationFixture();
    input.assessment.retrieval.displayedScripts[0].item.source_ids = [...sourceIds];

    expect(() => buildAnalysisViewModel(input)).toThrowError("invalid_script_source_reference");
  });

  it("rejects duplicate applicability for a cited policy", () => {
    const input = presentationFixture();
    const cited = input.assessment.retrieval.policyApplicability.find(
      ({ policy }) => policy.policy_id === "united-policy"
    );
    if (!cited) throw new Error("missing_cited_policy_fixture");
    input.assessment.retrieval.policyApplicability.push(structuredClone(cited));

    expect(() => buildAnalysisViewModel(input)).toThrowError("invalid_script_source_reference");
  });

  it("uses the script-reference error when a displayed citation has duplicate applicability", () => {
    const input = presentationFixture();
    const displayed = input.assessment.retrieval.policyApplicability.find(
      ({ policy }) => policy.policy_id === "eu-regulation"
    );
    if (!displayed) throw new Error("missing_displayed_policy_fixture");
    input.assessment.retrieval.displayedScripts[0].item.source_ids = ["eu-regulation"];
    input.assessment.retrieval.policyApplicability.push(structuredClone(displayed));

    expect(() => buildAnalysisViewModel(input)).toThrowError("invalid_script_source_reference");
  });

  it("attributes carrier admission facts from unresolved decisions when public scenarios are empty", () => {
    const input = presentationFixture();
    input.claimState.facts.operatingCarrier = null;
    input.claimState.facts.destination = {
      city: "Paris",
      airport: "CDG",
      country: "France"
    };
    input.claimState.unresolvedFields = ["operatingCarrier"];
    if (!input.context) throw new Error("missing_context_fixture");
    input.context.raw = input.claimState;
    input.context.resolutionFacts.operatingCarrier = null;
    input.context.resolutionFacts.destination = {
      city: "Paris",
      airport: "CDG",
      country: "France"
    };
    input.context.normalizedOperatingCarrier = {
      value: null,
      source: "insufficient_facts",
      confidence: "low",
      reasons: ["Operating carrier is missing"]
    };
    input.context.jurisdiction.operatingCarrierRegion = {
      value: null,
      source: "insufficient_facts",
      confidence: "low",
      reasons: ["Operating carrier is missing"]
    };
    input.context.jurisdiction.destinationRegion = {
      value: "EU_EEA_CH",
      source: "airport_registry",
      confidence: "high",
      reasons: ["CDG is in France"]
    };
    input.context.jurisdiction.eu261 = {
      value: "unknown",
      source: "insufficient_facts",
      confidence: "low",
      reasons: ["Inbound EU scope requires the operating carrier region"]
    };
    input.context.scenarios = {
      status: "needs_information",
      scenarioIds: [],
      primaryScenario: null,
      decisions: [
        {
          scenarioId: "us_airline_disruption",
          status: "active",
          reasons: ["US route"],
          missingFacts: []
        },
        {
          scenarioId: "eu_uk_air_disruption",
          status: "unresolved",
          reasons: ["Inbound EU route needs carrier region"],
          missingFacts: ["operatingCarrier"]
        }
      ],
      missingFacts: ["operatingCarrier"]
    };
    input.assessment = {
      ...input.assessment,
      primaryScenario: null,
      scenarioIds: [],
      factsUsed: [],
      missingFacts: [],
      legalRegimes: [],
      assessments: [],
      retrieval: {
        policyApplicability: [],
        displayedPolicies: [],
        displayedCases: [],
        displayedScripts: []
      },
      nextActions: []
    };

    expect(buildAnalysisViewModel(input).missingFacts).toContainEqual({
      path: "operatingCarrier",
      label: "operatingCarrier",
      reason: "Needed to determine whether the eu uk air disruption scenario applies.",
      material: true,
      scenarioIds: ["eu_uk_air_disruption"]
    });
  });

  it("returns a deliberately empty view for a valid blocked domain payload", () => {
    const input = blockedFixture();
    expect(input.claimState.facts.provider).toBe("United");

    expect(buildAnalysisViewModel(input)).toMatchObject({
      status: "out_of_scope",
      primaryScenario: null,
      scenarioIds: [],
      factsUsed: [],
      missingFacts: [],
      factReview: null,
      derivedContext: null,
      policyApplicability: [],
      assessments: [],
      officialSources: [],
      providerCommitments: [],
      similarCases: [],
      scripts: [],
      evidenceStatus: "missing",
      nextActions: []
    });
  });

  it("rejects blocked context before checking ordinary mapper inputs", () => {
    const input = blockedFixture();
    input.context = presentationFixture().context;
    input.assessment.retrieval.displayedScripts = [
      {
        item: {
          ...presentationFixture().assessment.retrieval.displayedScripts[0].item,
          source_ids: []
        },
        reasons: [],
        score: 0
      }
    ];

    expect(() => buildAnalysisViewModel(input)).toThrowError("blocked_context_must_be_null");
  });

  it.each([
    [
      "primary scenario",
      (input: AnalysisPresentationInput) => {
        Object.assign(input.assessment, { primaryScenario: "us_airline_disruption" });
      }
    ],
    [
      "scenario IDs",
      (input: AnalysisPresentationInput) => {
        Object.assign(input.assessment, { scenarioIds: ["us_airline_disruption"] });
      }
    ],
    [
      "facts used",
      (input: AnalysisPresentationInput) => {
        Object.assign(input.assessment, {
          factsUsed: presentationFixture().assessment.factsUsed
        });
      }
    ],
    [
      "missing facts",
      (input: AnalysisPresentationInput) => {
        Object.assign(input.assessment, { missingFacts: ["isOvernight"] });
      }
    ],
    [
      "legal regimes",
      (input: AnalysisPresentationInput) => {
        Object.assign(input.assessment, { legalRegimes: ["US_DOT_REFUND"] });
      }
    ],
    [
      "assessments",
      (input: AnalysisPresentationInput) => {
        Object.assign(input.assessment, {
          assessments: presentationFixture().assessment.assessments
        });
      }
    ],
    [
      "next actions",
      (input: AnalysisPresentationInput) => {
        Object.assign(input.assessment, { nextActions: ["Do not map this."] });
      }
    ],
    [
      "policy applicability",
      (input: AnalysisPresentationInput) => {
        Object.assign(input.assessment.retrieval, {
          policyApplicability: presentationFixture().assessment.retrieval.policyApplicability
        });
      }
    ],
    [
      "displayed policies",
      (input: AnalysisPresentationInput) => {
        Object.assign(input.assessment.retrieval, {
          displayedPolicies: presentationFixture().assessment.retrieval.displayedPolicies
        });
      }
    ],
    [
      "displayed cases",
      (input: AnalysisPresentationInput) => {
        Object.assign(input.assessment.retrieval, {
          displayedCases: presentationFixture().assessment.retrieval.displayedCases
        });
      }
    ],
    [
      "displayed scripts",
      (input: AnalysisPresentationInput) => {
        Object.assign(input.assessment.retrieval, {
          displayedScripts: [
            {
              item: {
                ...presentationFixture().assessment.retrieval.displayedScripts[0].item,
                source_ids: []
              },
              reasons: [],
              score: 0
            }
          ]
        });
      }
    ]
  ] as const)("rejects blocked payload with populated %s", (_label, mutate) => {
    const input = blockedFixture();
    mutate(input);

    expect(() => buildAnalysisViewModel(input)).toThrowError("invalid_blocked_analysis_payload");
  });

  it.each([
    [[], "missing"],
    [["missing"], "missing"],
    [["complete"], "complete"],
    [["complete", "missing"], "partial"],
    [["complete", "partial"], "partial"]
  ] as const)("aggregates material evidence %j as %s", (statuses, expected) => {
    const input = presentationFixture();
    const baseRemedy = input.assessment.assessments[0];
    input.assessment.assessments =
      statuses.length === 0
        ? [{ ...baseRemedy, material: false }]
        : statuses.map((status, index) => ({
            ...structuredClone(baseRemedy),
            remedyId: index === 0 ? "us_hotel" : "us_ground_transport",
            evidence: { ...baseRemedy.evidence, status }
          }));

    expect(buildAnalysisViewModel(input).evidenceStatus).toBe(expected);
  });

  it("deep-copies every nested presentation collection", () => {
    const input = presentationFixture();
    const view = buildAnalysisViewModel(input);
    const firstPolicy = input.assessment.retrieval.policyApplicability[0].policy;
    const firstCase = input.assessment.retrieval.displayedCases[0].item;

    expect(view.factReview?.facts).not.toBe(input.claimState.facts);
    expect(view.factReview?.facts.origin).not.toBe(input.claimState.facts.origin);
    expect(view.factReview?.facts.assistance).not.toBe(input.claimState.facts.assistance);
    expect(view.factReview?.facts.expenses).not.toBe(input.claimState.facts.expenses);
    expect(view.factsUsed[1].value).not.toBe(input.assessment.factsUsed[1].value);

    input.claimState.facts.expenses.push("Input-only expense");
    input.claimState.conflicts[0].candidates[0].value = false;
    input.context?.normalizedProvider.reasons.push("Input-only reason");
    firstPolicy.applicable_conditions.push("Input-only condition");
    firstCase.review_notes.push("Input-only note");
    input.assessment.assessments[0].evidence.missing.push("Input-only evidence");
    input.assessment.assessments[0].requestOptions[0].sourceIds.push("input-only-source");

    expect(view.factReview?.facts.expenses).toEqual(["Hotel receipt"]);
    expect(view.factReview?.conflicts[0].candidates[0].value).toBe(true);
    expect(view.derivedContext?.normalizedProvider.reasons).toEqual(["Matched United"]);
    expect(view.officialSources[0].conditions).not.toContain("Input-only condition");
    expect(view.similarCases[0].reviewNotes).not.toContain("Input-only note");
    expect(view.assessments[0].evidence.missing).not.toContain("Input-only evidence");
    expect(view.assessments[0].requestOptions[0].sourceIds).not.toContain("input-only-source");

    view.factReview?.facts.evidence.push("View-only evidence");
    view.officialSources[0].rights.push("View-only right");
    expect(input.claimState.facts.evidence).not.toContain("View-only evidence");
    expect(firstPolicy.compensation_or_rights).not.toContain("View-only right");
  });

  it("provides fresh, contract-complete transport fixtures", () => {
    const first = sourceTransparencyFixture();
    const second = sourceTransparencyFixture();
    const categories = [
      ...first.result.officialSources.map(({ category }) => category),
      ...first.result.providerCommitments.map(({ category }) => category),
      ...first.result.similarCases.map(({ category }) => category)
    ];
    const eu = euCancellationFixture();

    expect(new Set(categories)).toEqual(
      new Set([
        "government_regulation",
        "regulator_guidance",
        "provider_commitment",
        "community_report",
        "user_report",
        "synthetic_example"
      ])
    );
    expect(syntheticOnlyFixture().result.similarCases).toEqual([
      expect.objectContaining({ category: "synthetic_example", url: null })
    ]);
    expect(eu.result.assessments[0]).toMatchObject({
      matchedConditions: [expect.any(Object)],
      missingConditions: [expect.any(Object)],
      exclusions: [expect.any(Object)]
    });
    expect(eu.result.nextActions).toHaveLength(1);

    first.result.officialSources[0].conditions.push("First-only mutation");
    expect(second.result.officialSources[0].conditions).not.toContain("First-only mutation");
  });

  it("applies transport overrides without mutating later fixture calls", async () => {
    const overrides = {
      result: { summary: "Overridden fixture summary." }
    };
    const first = analyzeResponseFixture(overrides);
    const second = analyzeResponseFixture();
    const withNull = analyzeResponseFixture({ result: { factReview: null } });
    const request = localRequest({ message: "Exact local request fixture." });
    const response = okAnalyzeResponse({ baseRevision: 7 });

    expect(first.result.summary).toBe("Overridden fixture summary.");
    expect(second.result.summary).not.toBe("Overridden fixture summary.");
    expect(withNull.result.factReview).toBeNull();
    expect(request).toMatchObject({
      message: "Exact local request fixture.",
      baseRevision: 0,
      requestedMode: "local"
    });
    expect((await response.json()).baseRevision).toBe(7);
    expect(overrides).toEqual({ result: { summary: "Overridden fixture summary." } });
  });
});
