import {
  buildAnalysisViewModel,
  type AnalysisPresentationInput,
  type AnalysisViewModel
} from "../../lib/analysis-view-model";
import type { AnalyzeClaimResponse } from "../../lib/api/analyze-contract";
import type {
  AssessmentResult,
  ClaimState,
  PolicyApplicability,
  RemedyAssessment,
  ResolvedClaimContext,
  ResolvedValue
} from "../../lib/domain/claim-contract";
import type { Case, Policy, Script } from "../../lib/types";
import { claimState, rawFacts } from "./raw-claims";

function resolved<T>(
  value: T,
  source: ResolvedValue<T>["source"],
  reasons: string[]
): ResolvedValue<T> {
  return { value, source, confidence: "high", reasons: [...reasons] };
}

function regulationPolicy(): Policy {
  return {
    policy_id: "eu-regulation",
    provider_type: "government",
    provider: "European Union",
    policy_name: "Regulation (EC) No 261/2004",
    legal_regime: "EU261",
    applicability_rule: "eu261_route",
    incident_types: ["airline_delay", "airline_cancellation"],
    applicable_regions: ["EU_EEA_CH"],
    applicable_providers: [],
    required_controllability: "any",
    source_url: "https://example.test/eu-regulation",
    source_type: "government_regulation",
    authority_level: "high",
    applicable_conditions: ["Qualifying route", "Cancellation or long delay"],
    compensation_or_rights: ["Care", "Refund or rerouting"],
    summary: "Primary legal text for the fixture.",
    last_checked: "2026-07-16"
  } satisfies Policy;
}

function guidancePolicy(): Policy {
  return {
    policy_id: "dot-guidance",
    provider_type: "government",
    provider: "US DOT",
    policy_name: "Airline refund guidance",
    legal_regime: "US_DOT_REFUND",
    applicability_rule: "origin_or_destination_region",
    incident_types: ["airline_delay", "airline_cancellation"],
    applicable_regions: ["US"],
    applicable_providers: [],
    required_controllability: "any",
    source_url: "https://example.test/dot-guidance",
    source_type: "regulator_guidance",
    authority_level: "high",
    applicable_conditions: ["Flight to, from, or within the United States"],
    compensation_or_rights: ["Refund when a qualifying alternative is declined"],
    summary: "Regulator guidance for the fixture.",
    last_checked: "2026-07-17"
  } satisfies Policy;
}

function providerPolicy(): Policy {
  return {
    policy_id: "united-policy",
    provider_type: "airline",
    provider: "United",
    policy_name: "United customer service plan",
    legal_regime: "provider_policy",
    applicability_rule: "listed_provider",
    incident_types: ["airline_delay", "airline_cancellation"],
    applicable_regions: ["global"],
    applicable_providers: ["United"],
    required_controllability: "controllable",
    source_url: "https://example.test/united-policy",
    source_type: "official_policy",
    authority_level: "medium",
    applicable_conditions: ["United is the operating carrier"],
    compensation_or_rights: ["Review the carrier's published commitments"],
    summary: "Carrier policy fixture.",
    last_checked: "2026-07-18"
  } satisfies Policy;
}

function excludedPolicy(): Policy {
  return {
    policy_id: "uk-excluded",
    provider_type: "government",
    provider: "UK CAA",
    policy_name: "UK passenger guidance",
    legal_regime: "UK261",
    applicability_rule: "uk261_route",
    incident_types: ["airline_delay", "airline_cancellation"],
    applicable_regions: ["UK"],
    applicable_providers: [],
    required_controllability: "any",
    source_url: "https://example.test/uk-guidance",
    source_type: "regulator_guidance",
    authority_level: "high",
    applicable_conditions: ["Qualifying UK route"],
    compensation_or_rights: ["Care under qualifying conditions"],
    summary: "Excluded policy fixture.",
    last_checked: "2026-07-18"
  } satisfies Policy;
}

function communityCase(): Case {
  return {
    case_id: "community-complete",
    source_type: "community_dp",
    source_name: "Reviewed community report",
    source_url: "https://example.test/community-case",
    provider_type: "airline",
    provider: "United",
    brand_or_airline: "United cancellation report",
    issue_type: "airline_cancellation",
    location_country: "US",
    booking_channel: "direct",
    loyalty_status: "Member",
    reservation_type: "paid",
    facts: "The traveler documented a controllable overnight cancellation.",
    requested_compensation: ["Hotel reimbursement"],
    actual_outcome: "United reimbursed the documented hotel expense in full.",
    evidence_used: ["Receipt"],
    escalation_path: ["Customer relations"],
    reusable_lesson: "Keep the disruption reason and receipt together.",
    confidence: "high",
    notes: "Reviewed fixture.",
    review_status: "approved",
    review_notes: ["Outcome is supported by the report."]
  } satisfies Case;
}

function userCase(): Case {
  return {
    case_id: "user-report",
    source_type: "user_submitted",
    source_name: "Reviewed user report",
    source_url: "https://example.test/user-case",
    provider_type: "airline",
    provider: "United",
    brand_or_airline: "User-submitted disruption report",
    issue_type: "airline_cancellation",
    location_country: "US",
    booking_channel: "direct",
    loyalty_status: "Unknown",
    reservation_type: "paid",
    facts: "The traveler submitted a receipt after an overnight disruption.",
    requested_compensation: ["Meal reimbursement"],
    actual_outcome: "Partial outcome: the airline acknowledged the request.",
    evidence_used: ["Receipt"],
    escalation_path: ["Customer relations"],
    reusable_lesson: "Preserve written acknowledgements.",
    confidence: "medium",
    notes: "Reviewed fixture.",
    review_status: "approved",
    review_notes: ["Specific result not detailed."]
  } satisfies Case;
}

function syntheticCase(): Case {
  return {
    case_id: "synthetic-example",
    source_type: "synthetic_example",
    source_name: "Synthetic example",
    source_url: "",
    provider_type: "airline",
    provider: "Example Air",
    brand_or_airline: "Synthetic overnight cancellation",
    issue_type: "airline_cancellation",
    location_country: "US",
    booking_channel: "unknown",
    loyalty_status: "Unknown",
    reservation_type: "unknown",
    facts: "Illustrative facts only.",
    requested_compensation: ["Documented expenses"],
    actual_outcome: "Outcome not reported.",
    evidence_used: [],
    escalation_path: [],
    reusable_lesson: "Use only as an illustration, never as a benchmark.",
    confidence: "low",
    notes: "Synthetic fixture.",
    review_status: "approved",
    review_notes: ["Outcome is incomplete; synthetic example only."]
  } satisfies Case;
}

function citedScript(): Script {
  return {
    script_id: "united-cancellation-request",
    source_ids: ["united-policy"],
    incident_types: ["airline_cancellation"],
    applicable_regions: ["global"],
    applicability_rule: "listed_provider",
    required_controllability: "controllable",
    provider: "United",
    channel: "email",
    tone: "polite_firm",
    language: "en",
    template: "Please review my documented expenses under your published customer service plan.",
    when_to_use: "Use after a controllable United cancellation with documented expenses."
  } satisfies Script;
}

function fixtureState(): ClaimState {
  return claimState(
    {
      incidentType: "airline_cancellation",
      providerType: "airline",
      provider: "United",
      operatingCarrier: "United",
      origin: { airport: "JFK", country: "US" },
      destination: { airport: "LAX", country: "US" },
      reasonCategory: "crew",
      userInitiatedChange: false,
      isOvernight: null,
      expenses: ["Hotel receipt"],
      evidence: ["Cancellation notice"],
      userGoal: "Request documented expenses"
    },
    2,
    {
      provenance: {
        incidentType: { source: "deterministic_extraction", factsRevision: 1 },
        operatingCarrier: { source: "user_correction", factsRevision: 2 }
      },
      conflicts: [
        {
          field: "isOvernight",
          candidates: [
            { value: true, source: "deterministic_extraction" },
            { value: false, source: "openai_extraction" }
          ]
        }
      ],
      unresolvedFields: ["isOvernight"]
    }
  );
}

function fixtureContext(state: ClaimState): ResolvedClaimContext {
  const facts = rawFacts({
    ...state.facts,
    origin: { ...state.facts.origin },
    destination: { ...state.facts.destination },
    assistance: { ...state.facts.assistance },
    expenses: [...state.facts.expenses],
    evidence: [...state.facts.evidence]
  });
  return {
    raw: state,
    resolutionFacts: facts,
    normalizedProvider: resolved("United", "provider_registry", ["Matched United"]),
    normalizedOperatingCarrier: resolved("United", "carrier_registry", ["Matched United"]),
    jurisdiction: {
      originRegion: resolved("US", "airport_registry", ["JFK is in the United States"]),
      destinationRegion: resolved("US", "airport_registry", ["LAX is in the United States"]),
      operatingCarrierRegion: resolved("US", "carrier_registry", ["United is a US carrier"]),
      eu261: resolved("does_not_apply", "scenario_rule", ["No qualifying EU route"]),
      uk261: resolved("does_not_apply", "scenario_rule", ["No qualifying UK route"])
    },
    controllability: resolved("controllable", "reason_rule", ["Crew reason is controllable"]),
    scenarios: {
      status: "resolved",
      scenarioIds: ["us_airline_disruption"],
      primaryScenario: "us_airline_disruption",
      decisions: [
        {
          scenarioId: "us_airline_disruption",
          status: "active",
          reasons: ["US route"],
          missingFacts: []
        }
      ],
      missingFacts: []
    }
  } satisfies ResolvedClaimContext;
}

function applicabilityItems(): PolicyApplicability[] {
  return [
    {
      policy: regulationPolicy(),
      status: "applicable",
      matchedConditions: ["Fixture dual-scope match"],
      missingConditions: [],
      exclusions: [],
      applicableCarrier: null
    },
    {
      policy: guidancePolicy(),
      status: "conditional",
      matchedConditions: ["US route"],
      missingConditions: ["Alternative acceptance"],
      exclusions: [],
      applicableCarrier: null
    },
    {
      policy: providerPolicy(),
      status: "applicable",
      matchedConditions: ["United operating carrier"],
      missingConditions: [],
      exclusions: [],
      applicableCarrier: "United"
    },
    {
      policy: excludedPolicy(),
      status: "not_applicable",
      matchedConditions: [],
      missingConditions: [],
      exclusions: ["No UK route"],
      applicableCarrier: null
    }
  ] satisfies PolicyApplicability[];
}

function fixtureRemedy(): RemedyAssessment {
  return {
    remedyId: "us_hotel",
    scenarioId: "us_airline_disruption",
    title: "Overnight hotel commitment",
    material: true,
    status: "conditional",
    factsUsed: ["incidentType", "operatingCarrier", "isOvernight"],
    matchedConditions: [
      {
        id: "us_route",
        label: "US route",
        status: "matched",
        factFields: ["origin.airport", "destination.airport"]
      }
    ],
    missingConditions: [
      {
        id: "overnight_disruption",
        label: "Overnight disruption",
        status: "missing",
        factFields: ["isOvernight"]
      }
    ],
    exclusions: [],
    sourceIds: ["united-policy"],
    providerCommitment: {
      commitmentId: "united-reviewed-commitment",
      normalizedCarrier: "United",
      applicableCarrierRole: "operating_carrier",
      sourceUrl: "https://example.test/united-commitment",
      sourceTitle: "Reviewed United disruption commitments",
      sourceProvider: "US DOT dashboard review",
      sourceType: "official_dashboard",
      legalRegime: "US_AIRLINE_COMMITMENT",
      authority: "medium",
      sourceLastChecked: "2026-07-18",
      conditions: ["Controllable overnight disruption"],
      rights: ["Hotel accommodation under the reviewed commitment"]
    },
    evidence: {
      status: "partial",
      held: ["Cancellation notice"],
      missing: ["Written disruption reason"]
    },
    requestOptions: [
      {
        tone: "conservative",
        remedyId: "us_hotel",
        remedyStatus: "conditional",
        text: "Could you confirm whether hotel assistance applies?",
        sourceIds: ["united-policy"]
      },
      {
        tone: "standard",
        remedyId: "us_hotel",
        remedyStatus: "conditional",
        text: "Please review hotel assistance under your published plan.",
        sourceIds: ["united-policy"]
      },
      {
        tone: "assertive",
        remedyId: "us_hotel",
        remedyStatus: "conditional",
        text: "Please provide a written assessment of hotel assistance.",
        sourceIds: ["united-policy"]
      }
    ],
    cautions: ["Carrier commitments depend on the exact operating carrier."],
    nextAction: "Confirm whether the disruption required an overnight stay."
  } satisfies RemedyAssessment;
}

function fixtureAssessment(): AssessmentResult {
  const applicability = applicabilityItems();
  return {
    status: "needs_information",
    primaryScenario: "us_airline_disruption",
    scenarioIds: ["us_airline_disruption"],
    factsRevision: 2,
    factsUsed: [
      {
        path: "incidentType",
        label: "incident type",
        value: "airline_cancellation",
        provenance: { source: "deterministic_extraction", factsRevision: 1 }
      },
      {
        path: "evidence",
        label: "evidence",
        value: ["Cancellation notice"],
        provenance: { source: "user_message", factsRevision: 2 }
      }
    ],
    missingFacts: ["isOvernight"],
    legalRegimes: ["US_DOT_REFUND", "US_AIRLINE_COMMITMENT"],
    extraction: {
      performed: true,
      requestedMode: "local",
      provider: "local",
      model: null
    },
    assessments: [fixtureRemedy()],
    retrieval: {
      policyApplicability: applicability,
      displayedPolicies: [
        {
          item: applicability[0].policy,
          reasons: ["exact_issue_match", "authority_match"],
          score: 98
        },
        {
          item: applicability[1].policy,
          reasons: ["jurisdiction_match"],
          score: 87
        }
      ],
      displayedCases: [
        { item: communityCase(), reasons: ["exact_issue_match"], score: 91 },
        { item: userCase(), reasons: ["provider_type_match"], score: 82 },
        { item: syntheticCase(), reasons: ["description_overlap"], score: 70 }
      ],
      displayedScripts: [{ item: citedScript(), reasons: ["provider_exact_match"], score: 95 }]
    },
    cautions: ["Verify the carrier response against the current source."],
    nextActions: [
      "Confirm whether the disruption required an overnight stay.",
      "Keep all receipts."
    ]
  } satisfies AssessmentResult;
}

export function presentationFixture(): AnalysisPresentationInput {
  const state = fixtureState();
  return {
    assessment: fixtureAssessment(),
    context: fixtureContext(state),
    claimState: state
  } satisfies AnalysisPresentationInput;
}

export function sourceTransparencyFixture(): AnalyzeClaimResponse {
  const input = presentationFixture();
  return {
    baseRevision: 1,
    claimState: input.claimState,
    result: buildAnalysisViewModel(input)
  } satisfies AnalyzeClaimResponse;
}

export function syntheticOnlyFixture(): AnalyzeClaimResponse {
  const base = sourceTransparencyFixture();
  const synthetic = base.result.similarCases.find(
    ({ category }) => category === "synthetic_example"
  );
  if (!synthetic) throw new Error("missing_synthetic_fixture");
  return {
    ...base,
    result: {
      ...base.result,
      officialSources: [],
      providerCommitments: [],
      similarCases: [{ ...synthetic, reviewNotes: [...synthetic.reviewNotes], rankingReasons: [] }],
      scripts: []
    }
  } satisfies AnalyzeClaimResponse;
}

export function euCancellationFixture(): AnalyzeClaimResponse {
  const base = sourceTransparencyFixture();
  const assessment = base.result.assessments[0];
  if (!assessment) throw new Error("missing_remedy_fixture");
  const result: AnalysisViewModel = {
    ...base.result,
    status: "needs_information",
    primaryScenario: "eu_uk_air_disruption",
    scenarioIds: ["eu_uk_air_disruption"],
    assessments: [
      {
        ...assessment,
        remedyId: "eu_uk_fixed_compensation",
        title: "EU/UK fixed compensation",
        matchedConditions: [
          { id: "delay_or_cancellation", label: "Cancellation", factPaths: ["incidentType"] }
        ],
        missingConditions: [
          {
            id: "cancellation_notice",
            label: "Cancellation notice timing",
            factPaths: ["cancellationNoticeHours"]
          }
        ],
        exclusions: [
          {
            id: "extraordinary_circumstances",
            label: "Extraordinary circumstances",
            factPaths: ["reasonCategory"]
          }
        ]
      }
    ],
    nextActions: [
      { title: "Next action", detail: "Confirm when the cancellation notice was sent." }
    ]
  };
  return { ...base, result } satisfies AnalyzeClaimResponse;
}
