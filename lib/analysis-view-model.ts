import {
  RAW_FACT_PATHS,
  type AssessmentResult,
  type ClaimState,
  type DerivedApplicability,
  type ExtractionMetadata,
  type FactDisplayItem,
  type FactProvenance,
  type PolicyApplicability,
  type RankedDisplayItem,
  type RawClaimFacts,
  type RawFactPath,
  type RawFactValue,
  type RemedyAssessment,
  type RemedyId,
  type RemedyStatus,
  type ResolvedClaimContext,
  type ResolvedValue,
  type ScenarioId,
  type WorkflowStatus
} from "./domain/claim-contract";
import type {
  Case,
  LegalRegime,
  Policy,
  PolicyRouteRegion,
  RetrievalMatchReason,
  Script
} from "./types";

export type AnalysisPresentationInput = {
  assessment: AssessmentResult;
  context: ResolvedClaimContext | null;
  claimState: ClaimState;
};

export type FactDisplayViewModel = {
  path: RawFactPath;
  label: string;
  value: RawFactValue | null;
  provenance: FactProvenance | null;
};

export type FactsUsedViewModel = FactDisplayViewModel[];

export type MissingFactViewModel = {
  path: RawFactPath;
  label: string;
  reason: string;
  material: boolean;
  scenarioIds: ScenarioId[];
};

export type FactConflictViewModel = {
  path: RawFactPath;
  label: string;
  candidates: Array<{
    value: RawFactValue;
    source: "deterministic_extraction" | "openai_extraction";
  }>;
};

export type DerivedValueViewModel<T> = {
  value: T;
  source: ResolvedValue<T>["source"];
  confidence: "low" | "medium" | "high";
  reasons: string[];
};

export type ConditionViewModel = {
  id: string;
  label: string;
  factPaths: RawFactPath[];
};

export type PolicyApplicabilityViewModel = {
  policyId: string;
  title: string;
  status: PolicyApplicability["status"];
  applicableCarrier: string | null;
  matchedConditions: string[];
  missingConditions: string[];
  exclusions: string[];
};

export type RequestOptionViewModel = {
  tone: "conservative" | "standard" | "assertive";
  remedyId: RemedyId;
  remedyStatus: RemedyStatus;
  text: string;
  sourceIds: string[];
};

export type RemedyAssessmentViewModel = {
  remedyId: RemedyId;
  title: string;
  status: RemedyStatus;
  matchedConditions: ConditionViewModel[];
  missingConditions: ConditionViewModel[];
  exclusions: ConditionViewModel[];
  evidence: RemedyAssessment["evidence"];
  requestOptions: RequestOptionViewModel[];
  cautions: string[];
};

export type PolicySourceViewModel = {
  id: string;
  title: string;
  category: "government_regulation" | "regulator_guidance" | "provider_commitment";
  sourceType: Policy["source_type"];
  provider: string;
  legalRegime: string;
  authority: "high" | "medium" | "low";
  conditions: string[];
  rights: string[];
  lastChecked: string;
  url: string;
  applicableCarrier: string | null;
  commitmentId: string | null;
  rankingReasons: string[];
};

export type CaseSourceViewModel = {
  id: string;
  title: string;
  category: "community_report" | "user_report" | "synthetic_example";
  sourceName: string;
  url: string | null;
  reviewStatus: "approved";
  reviewNotes: string[];
  facts: string;
  outcome: string;
  outcomeComplete: boolean;
  reusableLesson: string;
  rankingReasons: string[];
};

export type ScriptViewModel = {
  id: string;
  title: string;
  channel: string;
  language: string;
  text: string;
  sourceIds: string[];
  rankingReasons: string[];
};

export type NextActionViewModel = { title: string; detail: string };
export type NextActions = [] | [NextActionViewModel];

export type AnalysisViewModel = {
  status: WorkflowStatus;
  primaryScenario: ScenarioId | null;
  scenarioIds: ScenarioId[];
  factsRevision: number;
  factsUsed: FactsUsedViewModel;
  missingFacts: MissingFactViewModel[];
  factReview: {
    facts: RawClaimFacts;
    provenance: Partial<Record<RawFactPath, FactProvenance>>;
    conflicts: FactConflictViewModel[];
    unresolvedFields: RawFactPath[];
  } | null;
  derivedContext: {
    normalizedProvider: DerivedValueViewModel<string | null>;
    normalizedOperatingCarrier: DerivedValueViewModel<string | null>;
    originRegion: DerivedValueViewModel<PolicyRouteRegion | null>;
    destinationRegion: DerivedValueViewModel<PolicyRouteRegion | null>;
    operatingCarrierRegion: DerivedValueViewModel<PolicyRouteRegion | null>;
    eu261: DerivedValueViewModel<DerivedApplicability>;
    uk261: DerivedValueViewModel<DerivedApplicability>;
    controllability: DerivedValueViewModel<"controllable" | "uncontrollable" | "unknown">;
    legalRegimes: LegalRegime[];
  } | null;
  policyApplicability: PolicyApplicabilityViewModel[];
  extraction: ExtractionMetadata;
  summary: string;
  assessments: RemedyAssessmentViewModel[];
  officialSources: PolicySourceViewModel[];
  providerCommitments: PolicySourceViewModel[];
  similarCases: CaseSourceViewModel[];
  scripts: ScriptViewModel[];
  evidenceStatus: "complete" | "partial" | "missing";
  nextActions: NextActions;
  cautions: string[];
  disclaimer: "Informational guidance only — not legal advice or a promise of compensation.";
};

const DISCLAIMER =
  "Informational guidance only — not legal advice or a promise of compensation." as const;

const rankingReasonLabels = {
  exact_issue_match: "Exact issue match",
  issue_alias_match: "Related issue match",
  provider_exact_match: "Exact provider match",
  provider_partial_match: "Related provider match",
  generic_provider_match: "General provider match",
  provider_type_match: "Provider type match",
  country_match: "Country match",
  booking_channel_match: "Booking channel match",
  loyalty_status_match: "Loyalty status match",
  disruption_reason_match: "Disruption reason match",
  denied_boarding_kind_match: "Denied boarding type match",
  description_overlap: "Description match",
  jurisdiction_match: "Jurisdiction match",
  provider_scope_match: "Provider scope match",
  controllability_match: "Controllability match",
  authority_match: "Authority match",
  confidence_match: "Confidence match"
} satisfies Record<RetrievalMatchReason, string>;

const incompleteOutcomePatterns = [
  /\boutcome (?:is |was )?not reported\b/i,
  /\bresult (?:is |was )?not reported\b/i,
  /\b(?:outcome|result) (?:is |was )?incomplete\b/i,
  /\bnot (?:fully|completely) reported\b/i,
  /\bnot (?:fully|completely) resolved\b/i,
  /\bno reported resolution\b/i,
  /\bpartial (?:outcome|result)\b/i,
  /\bspecific (?:outcome|result|payout amount) (?:is |was )?not detailed\b/i
] as const;

function copyRawFactValue(value: RawFactValue): RawFactValue {
  return Array.isArray(value) ? [...value] : value;
}

function copyRawFacts(facts: RawClaimFacts): RawClaimFacts {
  return {
    incidentType: facts.incidentType,
    providerType: facts.providerType,
    provider: facts.provider,
    brandOrProperty: facts.brandOrProperty,
    operatingCarrier: facts.operatingCarrier,
    origin: { ...facts.origin },
    destination: { ...facts.destination },
    statedReason: facts.statedReason,
    reasonCategory: facts.reasonCategory,
    userInitiatedChange: facts.userInitiatedChange,
    scheduledFinalArrival: facts.scheduledFinalArrival,
    actualFinalArrival: facts.actualFinalArrival,
    finalArrivalDelayMinutes: facts.finalArrivalDelayMinutes,
    isOvernight: facts.isOvernight,
    cancellationNoticeHours: facts.cancellationNoticeHours,
    assistance: { ...facts.assistance },
    deniedBoardingKind: facts.deniedBoardingKind,
    oversalesConfirmed: facts.oversalesConfirmed,
    confirmedReservation: facts.confirmedReservation,
    checkedInOnTime: facts.checkedInOnTime,
    atGateOnTime: facts.atGateOnTime,
    documentsCompliant: facts.documentsCompliant,
    replacementArrivalDelayMinutes: facts.replacementArrivalDelayMinutes,
    confirmedHotelReservation: facts.confirmedHotelReservation,
    qualifyingHotelReservation: facts.qualifyingHotelReservation,
    bookingChannel: facts.bookingChannel,
    loyaltyStatus: facts.loyaltyStatus,
    membershipAttached: facts.membershipAttached,
    wasWalked: facts.wasWalked,
    replacementLodgingProvided: facts.replacementLodgingProvided,
    expenses: [...facts.expenses],
    evidence: [...facts.evidence],
    userGoal: facts.userGoal
  };
}

function policyCategory(
  policy: Policy,
  applicability: PolicyApplicability
): PolicySourceViewModel["category"] {
  if (policy.legal_regime === "provider_policy" && applicability.applicableCarrier !== null) {
    return "provider_commitment";
  }
  return policy.source_type === "government_regulation"
    ? "government_regulation"
    : "regulator_guidance";
}

function caseCategory(item: Case): CaseSourceViewModel["category"] {
  if (item.source_type === "community_dp") return "community_report";
  if (item.source_type === "user_submitted") return "user_report";
  return "synthetic_example";
}

function humanRankingReasons(reasons: readonly RetrievalMatchReason[]): string[] {
  return reasons.map((reason) => rankingReasonLabels[reason]);
}

function mapPolicySource(
  policy: Policy,
  applicability: PolicyApplicability,
  rankingReasons: readonly RetrievalMatchReason[]
): PolicySourceViewModel {
  return {
    id: policy.policy_id,
    title: policy.policy_name,
    category: policyCategory(policy, applicability),
    sourceType: policy.source_type,
    provider: policy.provider,
    legalRegime: policy.legal_regime,
    authority: policy.authority_level,
    conditions: [...policy.applicable_conditions],
    rights: [...policy.compensation_or_rights],
    lastChecked: policy.last_checked,
    url: policy.source_url,
    applicableCarrier: applicability.applicableCarrier,
    commitmentId: null,
    rankingReasons: humanRankingReasons(rankingReasons)
  };
}

function assertBlockedAssessment(assessment: AssessmentResult): void {
  const hasOrdinaryAnalysis =
    assessment.primaryScenario !== null ||
    assessment.scenarioIds.length > 0 ||
    assessment.factsUsed.length > 0 ||
    assessment.missingFacts.length > 0 ||
    assessment.legalRegimes.length > 0 ||
    assessment.assessments.length > 0 ||
    assessment.nextActions.length > 0 ||
    assessment.retrieval.policyApplicability.length > 0 ||
    assessment.retrieval.displayedPolicies.length > 0 ||
    assessment.retrieval.displayedCases.length > 0 ||
    assessment.retrieval.displayedScripts.length > 0;
  if (hasOrdinaryAnalysis) throw new Error("invalid_blocked_analysis_payload");
}

function findApplicability(
  items: readonly PolicyApplicability[],
  policyId: string
): PolicyApplicability {
  const matches = items.filter(({ policy }) => policy.policy_id === policyId);
  if (matches.length !== 1) throw new Error("invalid_policy_applicability_reference");
  return matches[0];
}

function mapProviderCommitments(assessment: AssessmentResult): PolicySourceViewModel[] {
  const byCommitmentId = new Map<string, PolicySourceViewModel>();
  assessment.assessments.forEach((remedy) => {
    const evidence = remedy.providerCommitment;
    if (!evidence) return;
    const mapped: PolicySourceViewModel = {
      id: evidence.commitmentId,
      title: evidence.sourceTitle,
      category: "provider_commitment",
      sourceType: evidence.sourceType,
      provider: evidence.sourceProvider,
      legalRegime: evidence.legalRegime,
      authority: evidence.authority,
      conditions: [...evidence.conditions],
      rights: [...evidence.rights],
      lastChecked: evidence.sourceLastChecked,
      url: evidence.sourceUrl,
      applicableCarrier: evidence.normalizedCarrier,
      commitmentId: evidence.commitmentId,
      rankingReasons: ["Matched operating carrier"]
    };
    const existing = byCommitmentId.get(evidence.commitmentId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(mapped)) {
      throw new Error("conflicting_provider_commitment_evidence");
    }
    if (!existing) byCommitmentId.set(evidence.commitmentId, mapped);
  });
  return [...byCommitmentId.values()];
}

function dedupeSources(items: readonly PolicySourceViewModel[]): PolicySourceViewModel[] {
  const byKey = new Map<string, PolicySourceViewModel>();
  items.forEach((item) => {
    const key = `${item.category}:${item.id}:${item.commitmentId ?? ""}`;
    const existing = byKey.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(item)) {
      throw new Error("conflicting_source_card");
    }
    if (!existing) byKey.set(key, item);
  });
  return [...byKey.values()];
}

function validateScriptSourceIds(sourceIds: readonly string[]): void {
  if (sourceIds.length === 0 || new Set(sourceIds).size !== sourceIds.length) {
    throw new Error("invalid_script_source_reference");
  }
}

function scriptPolicyApplicability(
  assessment: AssessmentResult,
  sourceId: string
): PolicyApplicability {
  const matches = assessment.retrieval.policyApplicability.filter(
    ({ policy }) => policy.policy_id === sourceId
  );
  if (matches.length !== 1 || matches[0].status === "not_applicable") {
    throw new Error("invalid_script_source_reference");
  }
  return matches[0];
}

function assertValidScriptPolicyReferences(assessment: AssessmentResult): void {
  assessment.retrieval.displayedScripts.forEach(({ item }) => {
    validateScriptSourceIds(item.source_ids);
    item.source_ids.forEach((sourceId) => {
      scriptPolicyApplicability(assessment, sourceId);
    });
  });
}

function addScriptPolicySources(
  assessment: AssessmentResult,
  policySources: readonly PolicySourceViewModel[]
): PolicySourceViewModel[] {
  const promoted = [...policySources];
  assessment.retrieval.displayedScripts.forEach(({ item }) => {
    validateScriptSourceIds(item.source_ids);
    item.source_ids.forEach((sourceId) => {
      const applicability = scriptPolicyApplicability(assessment, sourceId);
      if (!promoted.some(({ id }) => id === sourceId)) {
        promoted.push(mapPolicySource(applicability.policy, applicability, []));
      }
    });
  });
  return dedupeSources(promoted);
}

function outcomeIsComplete(item: Case): boolean {
  const evidence = [item.actual_outcome, ...item.review_notes].join("\n");
  return !incompleteOutcomePatterns.some((pattern) => pattern.test(evidence));
}

function mapCaseSource(ranked: RankedDisplayItem<Case>): CaseSourceViewModel {
  if (ranked.item.review_status !== "approved") throw new Error("invalid_case_review_status");
  return {
    id: ranked.item.case_id,
    title: ranked.item.brand_or_airline,
    category: caseCategory(ranked.item),
    sourceName: ranked.item.source_name,
    url: ranked.item.source_url.trim() === "" ? null : ranked.item.source_url,
    reviewStatus: "approved",
    reviewNotes: [...ranked.item.review_notes],
    facts: ranked.item.facts,
    outcome: ranked.item.actual_outcome,
    outcomeComplete: outcomeIsComplete(ranked.item),
    reusableLesson: ranked.item.reusable_lesson,
    rankingReasons: humanRankingReasons(ranked.reasons)
  };
}

function mapScript(ranked: RankedDisplayItem<Script>): ScriptViewModel {
  validateScriptSourceIds(ranked.item.source_ids);
  return {
    id: ranked.item.script_id,
    title: ranked.item.when_to_use,
    channel: ranked.item.channel,
    language: ranked.item.language,
    text: ranked.item.template,
    sourceIds: [...ranked.item.source_ids],
    rankingReasons: humanRankingReasons(ranked.reasons)
  };
}

function mapFacts(items: readonly FactDisplayItem[]): FactsUsedViewModel {
  return items.map((item) => ({
    path: item.path,
    label: item.label,
    value: item.value === null ? null : copyRawFactValue(item.value),
    provenance: item.provenance ? { ...item.provenance } : null
  }));
}

function factLabel(path: RawFactPath): string {
  return path.replaceAll(".", " ");
}

function conditionHasPath(
  conditions: readonly RemedyAssessment["missingConditions"][number][],
  path: RawFactPath
): boolean {
  return conditions.some(({ factFields }) => factFields.includes(path));
}

function mapMissingFacts(input: AnalysisPresentationInput): MissingFactViewModel[] {
  if (input.context === null) return [];
  const ordinary = new Set(input.assessment.missingFacts);
  const unresolved = new Set(input.claimState.unresolvedFields);
  const conflictPaths = new Set(input.claimState.conflicts.map(({ field }) => field));
  const admissionByPath = new Map<RawFactPath, ScenarioId[]>();
  input.context.scenarios.decisions.forEach((decision) => {
    if (decision.status !== "unresolved") return;
    decision.missingFacts.forEach((path) => {
      const scenarioIds = admissionByPath.get(path) ?? [];
      if (!scenarioIds.includes(decision.scenarioId)) scenarioIds.push(decision.scenarioId);
      admissionByPath.set(path, scenarioIds);
    });
  });
  const remediesByPath = new Map<RawFactPath, RemedyAssessment[]>();
  input.assessment.assessments.forEach((remedy) => {
    remedy.missingConditions.forEach(({ factFields }) => {
      factFields.forEach((path) => {
        const remedies = remediesByPath.get(path) ?? [];
        if (!remedies.includes(remedy)) remedies.push(remedy);
        remediesByPath.set(path, remedies);
      });
    });
  });
  const included = new Set<RawFactPath>([
    ...ordinary,
    ...unresolved,
    ...admissionByPath.keys(),
    ...remediesByPath.keys()
  ]);
  return RAW_FACT_PATHS.filter((path) => included.has(path)).map((path) => {
    const admissionScenarioIds = admissionByPath.get(path) ?? [];
    const affectedRemedies = remediesByPath.get(path) ?? [];
    const scenarioIds = [...admissionScenarioIds];
    affectedRemedies.forEach(({ scenarioId }) => {
      if (!scenarioIds.includes(scenarioId)) scenarioIds.push(scenarioId);
    });
    let reason = "Needed to complete the condition assessment.";
    if (conflictPaths.has(path)) {
      reason = "Conflicting extractor values must be resolved.";
    } else if (admissionScenarioIds.length > 0) {
      reason = `Needed to determine whether the ${admissionScenarioIds[0].replaceAll(
        "_",
        " "
      )} scenario applies.`;
    } else if (
      affectedRemedies.some(({ missingConditions }) => conditionHasPath(missingConditions, path))
    ) {
      reason = "Needed to assess a remedy condition.";
    }
    return {
      path,
      label: factLabel(path),
      reason,
      material:
        admissionScenarioIds.length > 0 || affectedRemedies.some(({ material }) => material),
      scenarioIds
    };
  });
}

function mapFactReview(state: ClaimState): Exclude<AnalysisViewModel["factReview"], null> {
  const provenance: Partial<Record<RawFactPath, FactProvenance>> = {};
  RAW_FACT_PATHS.forEach((path) => {
    const item = state.provenance[path];
    if (item) provenance[path] = { ...item };
  });
  return {
    facts: copyRawFacts(state.facts),
    provenance,
    conflicts: state.conflicts.map((conflict) => ({
      path: conflict.field,
      label: factLabel(conflict.field),
      candidates: conflict.candidates.map((candidate) => ({
        value: copyRawFactValue(candidate.value),
        source: candidate.source
      }))
    })),
    unresolvedFields: [...state.unresolvedFields]
  };
}

function mapPolicyApplicability(item: PolicyApplicability): PolicyApplicabilityViewModel {
  return {
    policyId: item.policy.policy_id,
    title: item.policy.policy_name,
    status: item.status,
    applicableCarrier: item.applicableCarrier,
    matchedConditions: [...item.matchedConditions],
    missingConditions: [...item.missingConditions],
    exclusions: [...item.exclusions]
  };
}

function mapDerivedValue<T>(value: ResolvedValue<T>): DerivedValueViewModel<T> {
  return {
    value: value.value,
    source: value.source,
    confidence: value.confidence,
    reasons: [...value.reasons]
  };
}

function mapDerivedContext(
  context: ResolvedClaimContext,
  legalRegimes: readonly LegalRegime[]
): Exclude<AnalysisViewModel["derivedContext"], null> {
  return {
    normalizedProvider: mapDerivedValue(context.normalizedProvider),
    normalizedOperatingCarrier: mapDerivedValue(context.normalizedOperatingCarrier),
    originRegion: mapDerivedValue(context.jurisdiction.originRegion),
    destinationRegion: mapDerivedValue(context.jurisdiction.destinationRegion),
    operatingCarrierRegion: mapDerivedValue(context.jurisdiction.operatingCarrierRegion),
    eu261: mapDerivedValue(context.jurisdiction.eu261),
    uk261: mapDerivedValue(context.jurisdiction.uk261),
    controllability: mapDerivedValue(context.controllability),
    legalRegimes: [...legalRegimes]
  };
}

function mapCondition(item: RemedyAssessment["matchedConditions"][number]): ConditionViewModel {
  return { id: item.id, label: item.label, factPaths: [...item.factFields] };
}

function mapRemedy(item: RemedyAssessment): RemedyAssessmentViewModel {
  return {
    remedyId: item.remedyId,
    title: item.title,
    status: item.status,
    matchedConditions: item.matchedConditions.map(mapCondition),
    missingConditions: item.missingConditions.map(mapCondition),
    exclusions: item.exclusions.map(mapCondition),
    evidence: {
      status: item.evidence.status,
      held: [...item.evidence.held],
      missing: [...item.evidence.missing]
    },
    requestOptions: item.requestOptions.map((option) => ({
      tone: option.tone,
      remedyId: option.remedyId,
      remedyStatus: option.remedyStatus,
      text: option.text,
      sourceIds: [...option.sourceIds]
    })),
    cautions: [...item.cautions]
  };
}

function assertWorkflowStatus(status: unknown): asserts status is WorkflowStatus {
  if (
    status !== "ready" &&
    status !== "needs_information" &&
    status !== "out_of_scope" &&
    status !== "unsupported_high_risk"
  ) {
    throw new Error("invalid_analysis_status");
  }
}

function buildSummary(input: AnalysisPresentationInput): string {
  switch (input.assessment.status) {
    case "ready":
      return "The available facts support a condition-level assessment of the active travel claim scenarios.";
    case "needs_information":
      return "More information is needed before every material condition can be assessed.";
    case "out_of_scope":
      return "This request is outside the supported travel claim scenarios.";
    case "unsupported_high_risk":
      return "This request needs support beyond this informational travel claims tool.";
    default:
      throw new Error("invalid_analysis_status");
  }
}

function aggregateEvidence(items: readonly RemedyAssessment[]): "complete" | "partial" | "missing" {
  const materialRemedies = items.filter(({ material }) => material);
  if (
    materialRemedies.length === 0 ||
    materialRemedies.every(({ evidence }) => evidence.status === "missing")
  ) {
    return "missing";
  }
  if (materialRemedies.every(({ evidence }) => evidence.status === "complete")) return "complete";
  return "partial";
}

function firstNextAction(items: readonly string[]): NextActions {
  return items.length === 0 ? [] : [{ title: "Next action", detail: items[0] }];
}

function uniqueCautions(topLevel: readonly string[], items: readonly RemedyAssessment[]): string[] {
  return [...new Set([...topLevel, ...items.flatMap(({ cautions }) => cautions)])];
}

function assertScriptSourcesResolveOnce(
  scripts: readonly ScriptViewModel[],
  officialSources: readonly PolicySourceViewModel[],
  providerCommitments: readonly PolicySourceViewModel[]
): void {
  const sources = [...officialSources, ...providerCommitments];
  scripts.forEach(({ sourceIds }) => {
    sourceIds.forEach((sourceId) => {
      if (sources.filter(({ id }) => id === sourceId).length !== 1) {
        throw new Error("invalid_script_source_reference");
      }
    });
  });
}

export function buildAnalysisViewModel(input: AnalysisPresentationInput): AnalysisViewModel {
  assertWorkflowStatus(input.assessment.status);
  const blocked =
    input.assessment.status === "out_of_scope" ||
    input.assessment.status === "unsupported_high_risk";
  if (blocked) {
    if (input.context !== null) throw new Error("blocked_context_must_be_null");
    assertBlockedAssessment(input.assessment);
    return {
      status: input.assessment.status,
      primaryScenario: null,
      scenarioIds: [],
      factsRevision: input.assessment.factsRevision,
      factsUsed: [],
      missingFacts: [],
      factReview: null,
      derivedContext: null,
      policyApplicability: [],
      extraction: { ...input.assessment.extraction },
      summary: buildSummary(input),
      assessments: [],
      officialSources: [],
      providerCommitments: [],
      similarCases: [],
      scripts: [],
      evidenceStatus: "missing",
      nextActions: [],
      cautions: [...input.assessment.cautions],
      disclaimer: DISCLAIMER
    };
  }
  if (input.context === null) throw new Error("analysis_context_required");

  assertValidScriptPolicyReferences(input.assessment);
  const displayedPolicySources = input.assessment.retrieval.displayedPolicies.map((ranked) =>
    mapPolicySource(
      ranked.item,
      findApplicability(input.assessment.retrieval.policyApplicability, ranked.item.policy_id),
      ranked.reasons
    )
  );
  const policySources = addScriptPolicySources(input.assessment, displayedPolicySources);
  const officialSources = policySources.filter(
    ({ category }) => category !== "provider_commitment"
  );
  const providerCommitments = dedupeSources([
    ...policySources.filter(({ category }) => category === "provider_commitment"),
    ...mapProviderCommitments(input.assessment)
  ]);
  const scripts = input.assessment.retrieval.displayedScripts.map(mapScript);
  assertScriptSourcesResolveOnce(scripts, officialSources, providerCommitments);

  return {
    status: input.assessment.status,
    primaryScenario: input.assessment.primaryScenario,
    scenarioIds: [...input.assessment.scenarioIds],
    factsRevision: input.assessment.factsRevision,
    factsUsed: mapFacts(input.assessment.factsUsed),
    missingFacts: mapMissingFacts(input),
    factReview: mapFactReview(input.claimState),
    derivedContext: mapDerivedContext(input.context, input.assessment.legalRegimes),
    policyApplicability: input.assessment.retrieval.policyApplicability.map(mapPolicyApplicability),
    extraction: { ...input.assessment.extraction },
    summary: buildSummary(input),
    assessments: input.assessment.assessments.map(mapRemedy),
    officialSources,
    providerCommitments,
    similarCases: input.assessment.retrieval.displayedCases.map(mapCaseSource),
    scripts,
    evidenceStatus: aggregateEvidence(input.assessment.assessments),
    nextActions: firstNextAction(input.assessment.nextActions),
    cautions: uniqueCautions(input.assessment.cautions, input.assessment.assessments),
    disclaimer: DISCLAIMER
  };
}
