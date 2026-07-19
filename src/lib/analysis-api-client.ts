import type { AnalyzeClaimRequest, AnalyzeClaimResponse } from "../../lib/api/analyze-contract";
import { parseAnalyzeClaimRequest, parseExtractionMetadata } from "../../lib/api/analyze-contract";
import {
  RAW_FACT_PATHS,
  type ClaimState,
  type RawFactPath,
  type ScenarioId
} from "../../lib/domain/claim-contract";
import { parseRawFactPatch } from "../../lib/domain/raw-fact-schema";
import { isLegalResponseRevision } from "./claim-workflow";

export type AnalysisApiError = {
  status: number;
  code: string;
  message: string;
  requestId: string | null;
  retryable: boolean;
};

export type AnalyzeClaimOptions = {
  signal: AbortSignal;
  demoAccessCode: string;
  fetcher?: typeof fetch;
};

export type AnalyzeResponseExpectation = {
  baseRevision: number;
  requestKind: "message" | "correction";
};

const GENERIC_ERROR_MESSAGE = "Analysis could not be completed. Please try again.";
const DISCLAIMER =
  "Informational guidance only — not legal advice or a promise of compensation." as const;
const scenarioIds: readonly ScenarioId[] = [
  "marriott_hotel_walk",
  "us_airline_disruption",
  "us_denied_boarding",
  "eu_uk_air_disruption"
];
const workflowStatuses = [
  "ready",
  "needs_information",
  "out_of_scope",
  "unsupported_high_risk"
] as const;
const rawFactPathSet: ReadonlySet<string> = new Set(RAW_FACT_PATHS);
const legalRegimes = [
  "provider_policy",
  "EU261",
  "UK261",
  "US_DOT_REFUND",
  "US_DOT_DENIED_BOARDING",
  "US_AIRLINE_COMMITMENT",
  "CA_APPR",
  "AU_ACL",
  "CN_FLIGHT_REGULATION"
] as const;
const policyRegions = ["EU_EEA_CH", "UK", "US", "CA", "AU", "CN", "other"] as const;
const resolvedSources = [
  "provider_registry",
  "airport_registry",
  "country_rule",
  "carrier_registry",
  "reason_rule",
  "scenario_rule",
  "insufficient_facts"
] as const;
const remedyIds = [
  "hotel_relocation",
  "hotel_transport",
  "hotel_guarantee_compensation",
  "us_refund",
  "us_rerouting",
  "us_meal",
  "us_hotel",
  "us_ground_transport",
  "voluntary_bump_offer",
  "denied_boarding_written_rights",
  "denied_boarding_compensation",
  "eu_uk_care",
  "eu_uk_refund_or_rerouting",
  "eu_uk_fixed_compensation"
] as const;
const remedyStatuses = ["supported", "conditional", "not_applicable"] as const;

const safeApiErrors = {
  invalid_json: { status: 400, message: "Invalid JSON request.", retryable: false },
  gpt_access_denied: { status: 401, message: "GPT access is denied.", retryable: false },
  request_too_large: { status: 413, message: "Request body is too large.", retryable: false },
  unsupported_media_type: {
    status: 415,
    message: "Request content type must be application/json.",
    retryable: false
  },
  unprocessable_request: {
    status: 422,
    message: "Request could not be processed.",
    retryable: false
  },
  rate_limited: {
    status: 429,
    message: "Too many requests. Please try again later.",
    retryable: true
  },
  concurrency_limited: {
    status: 429,
    message: "Too many requests are in progress. Please try again later.",
    retryable: true
  },
  budget_restricted: {
    status: 429,
    message: "GPT analysis is temporarily restricted.",
    retryable: false
  },
  model_refusal: {
    status: 422,
    message: "The model could not process this request.",
    retryable: false
  },
  model_timeout: {
    status: 504,
    message: "The analysis service timed out.",
    retryable: true
  },
  upstream_rate_limited: {
    status: 502,
    message: "The analysis service is temporarily unavailable.",
    retryable: true
  },
  upstream_unavailable: {
    status: 502,
    message: "The analysis service is temporarily unavailable.",
    retryable: true
  },
  invalid_model_json: {
    status: 502,
    message: "The analysis service returned an invalid response.",
    retryable: true
  },
  invalid_model_schema: {
    status: 502,
    message: "The analysis service returned an invalid response.",
    retryable: true
  },
  upstream_failure: {
    status: 502,
    message: "The analysis service is temporarily unavailable.",
    retryable: true
  }
} as const;

function invalidResponse(): never {
  throw new Error("invalid_analysis_response");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordWithExactKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) invalidResponse();
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    invalidResponse();
  }
  return value;
}

function assertSafeRevision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalidResponse();
}

function assertString(value: unknown, allowEmpty = false): asserts value is string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) invalidResponse();
}

function assertBoolean(value: unknown): asserts value is boolean {
  if (typeof value !== "boolean") invalidResponse();
}

function assertEnum<T extends string>(value: unknown, allowed: readonly T[]): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalidResponse();
}

function assertStringArray(value: unknown, allowEmptyItems = false): asserts value is string[] {
  if (!Array.isArray(value)) invalidResponse();
  value.forEach((item) => assertString(item, allowEmptyItems));
}

function assertUniqueStrings(
  value: unknown,
  allowed?: readonly string[]
): asserts value is string[] {
  assertStringArray(value);
  if (new Set(value).size !== value.length) invalidResponse();
  if (allowed && value.some((item) => !allowed.includes(item))) invalidResponse();
}

function assertHttpUrl(value: unknown): asserts value is string {
  assertString(value);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalidResponse();
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") invalidResponse();
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .toSorted()
      .map((key) => [key, canonicalJsonValue(value[key])])
  );
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalJsonValue(left)) === JSON.stringify(canonicalJsonValue(right));
}

function validateClaimState(value: unknown): ClaimState {
  if (!isRecord(value)) invalidResponse();
  assertSafeRevision(value.revision);
  const parsed = parseAnalyzeClaimRequest({
    message: "Validate the public response state.",
    prior: value,
    baseRevision: value.revision,
    requestedMode: "local"
  });
  if (!parsed.success) invalidResponse();
  return parsed.data.prior;
}

function assertRawFactValue(path: RawFactPath, value: unknown): void {
  const parsed = parseRawFactPatch({ set: { [path]: value } });
  if (!parsed.success) invalidResponse();
}

function validateFactDisplay(value: unknown): void {
  const item = recordWithExactKeys(value, ["path", "label", "value", "provenance"]);
  if (typeof item.path !== "string" || !rawFactPathSet.has(item.path)) invalidResponse();
  assertString(item.label);
  assertRawFactValue(item.path as RawFactPath, item.value);
  if (item.provenance !== null) {
    const provenance = recordWithExactKeys(item.provenance, ["source", "factsRevision"]);
    assertEnum(provenance.source, [
      "user_correction",
      "user_message",
      "deterministic_extraction",
      "openai_extraction"
    ]);
    assertSafeRevision(provenance.factsRevision);
  }
}

function validateMissingFact(value: unknown): void {
  const item = recordWithExactKeys(value, ["path", "label", "reason", "material", "scenarioIds"]);
  if (typeof item.path !== "string" || !rawFactPathSet.has(item.path)) invalidResponse();
  assertString(item.label);
  assertString(item.reason);
  assertBoolean(item.material);
  assertUniqueStrings(item.scenarioIds, scenarioIds);
}

function validateCondition(value: unknown): void {
  const item = recordWithExactKeys(value, ["id", "label", "factPaths"]);
  assertString(item.id);
  assertString(item.label);
  assertUniqueStrings(item.factPaths, RAW_FACT_PATHS);
}

function validatePolicyApplicability(value: unknown): void {
  const item = recordWithExactKeys(value, [
    "policyId",
    "title",
    "status",
    "applicableCarrier",
    "matchedConditions",
    "missingConditions",
    "exclusions"
  ]);
  assertString(item.policyId);
  assertString(item.title);
  assertEnum(item.status, ["applicable", "conditional", "not_applicable"]);
  if (item.applicableCarrier !== null) assertString(item.applicableCarrier);
  assertStringArray(item.matchedConditions);
  assertStringArray(item.missingConditions);
  assertStringArray(item.exclusions);
}

function validateRequestOption(value: unknown): void {
  const item = recordWithExactKeys(value, [
    "tone",
    "remedyId",
    "remedyStatus",
    "text",
    "sourceIds"
  ]);
  assertEnum(item.tone, ["conservative", "standard", "assertive"]);
  assertEnum(item.remedyId, remedyIds);
  assertEnum(item.remedyStatus, remedyStatuses);
  assertString(item.text);
  assertUniqueStrings(item.sourceIds);
}

function validateAssessment(value: unknown): void {
  const item = recordWithExactKeys(value, [
    "remedyId",
    "title",
    "status",
    "matchedConditions",
    "missingConditions",
    "exclusions",
    "evidence",
    "requestOptions",
    "cautions"
  ]);
  assertEnum(item.remedyId, remedyIds);
  assertString(item.title);
  assertEnum(item.status, remedyStatuses);
  if (!Array.isArray(item.matchedConditions)) invalidResponse();
  item.matchedConditions.forEach(validateCondition);
  if (!Array.isArray(item.missingConditions)) invalidResponse();
  item.missingConditions.forEach(validateCondition);
  if (!Array.isArray(item.exclusions)) invalidResponse();
  item.exclusions.forEach(validateCondition);
  const evidence = recordWithExactKeys(item.evidence, ["status", "held", "missing"]);
  assertEnum(evidence.status, ["complete", "partial", "missing"]);
  assertStringArray(evidence.held);
  assertStringArray(evidence.missing);
  if (!Array.isArray(item.requestOptions)) invalidResponse();
  item.requestOptions.forEach(validateRequestOption);
  assertStringArray(item.cautions);
}

function validatePolicySource(value: unknown): void {
  const item = recordWithExactKeys(value, [
    "id",
    "title",
    "category",
    "sourceType",
    "provider",
    "legalRegime",
    "authority",
    "conditions",
    "rights",
    "lastChecked",
    "url",
    "applicableCarrier",
    "commitmentId",
    "rankingReasons"
  ]);
  assertString(item.id);
  assertString(item.title);
  assertEnum(item.category, ["government_regulation", "regulator_guidance", "provider_commitment"]);
  assertEnum(item.sourceType, [
    "official_policy",
    "government_regulation",
    "regulator_guidance",
    "official_dashboard",
    "terms"
  ]);
  assertString(item.provider);
  assertEnum(item.legalRegime, legalRegimes);
  assertEnum(item.authority, ["high", "medium", "low"]);
  assertStringArray(item.conditions);
  assertStringArray(item.rights);
  assertString(item.lastChecked);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.lastChecked)) invalidResponse();
  assertHttpUrl(item.url);
  if (item.applicableCarrier !== null) assertString(item.applicableCarrier);
  if (item.commitmentId !== null) assertString(item.commitmentId);
  assertStringArray(item.rankingReasons);
}

function validateCaseSource(value: unknown): void {
  const item = recordWithExactKeys(value, [
    "id",
    "title",
    "category",
    "sourceName",
    "url",
    "reviewStatus",
    "reviewNotes",
    "facts",
    "outcome",
    "outcomeComplete",
    "reusableLesson",
    "rankingReasons"
  ]);
  assertString(item.id);
  assertString(item.title);
  assertEnum(item.category, ["community_report", "user_report", "synthetic_example"]);
  assertString(item.sourceName);
  if (item.url !== null) assertHttpUrl(item.url);
  if (item.category === "synthetic_example" && item.url !== null) invalidResponse();
  assertEnum(item.reviewStatus, ["approved"]);
  assertStringArray(item.reviewNotes);
  assertString(item.facts);
  assertString(item.outcome);
  assertBoolean(item.outcomeComplete);
  assertString(item.reusableLesson);
  assertStringArray(item.rankingReasons);
}

function validateScript(value: unknown): void {
  const item = recordWithExactKeys(value, [
    "id",
    "title",
    "channel",
    "language",
    "text",
    "sourceIds",
    "rankingReasons"
  ]);
  assertString(item.id);
  assertString(item.title);
  assertString(item.channel);
  assertString(item.language);
  assertString(item.text);
  assertUniqueStrings(item.sourceIds);
  if (item.sourceIds.length === 0) invalidResponse();
  assertStringArray(item.rankingReasons);
}

function validateDerivedValue(value: unknown, validateValue: (candidate: unknown) => void): void {
  const item = recordWithExactKeys(value, ["value", "source", "confidence", "reasons"]);
  validateValue(item.value);
  assertEnum(item.source, resolvedSources);
  assertEnum(item.confidence, ["low", "medium", "high"]);
  assertStringArray(item.reasons);
}

function validateDerivedContext(value: unknown): void {
  const context = recordWithExactKeys(value, [
    "normalizedProvider",
    "normalizedOperatingCarrier",
    "originRegion",
    "destinationRegion",
    "operatingCarrierRegion",
    "eu261",
    "uk261",
    "controllability",
    "legalRegimes"
  ]);
  const nullableString = (candidate: unknown) => {
    if (candidate !== null) assertString(candidate);
  };
  const nullableRegion = (candidate: unknown) => {
    if (candidate !== null) assertEnum(candidate, policyRegions);
  };
  validateDerivedValue(context.normalizedProvider, nullableString);
  validateDerivedValue(context.normalizedOperatingCarrier, nullableString);
  validateDerivedValue(context.originRegion, nullableRegion);
  validateDerivedValue(context.destinationRegion, nullableRegion);
  validateDerivedValue(context.operatingCarrierRegion, nullableRegion);
  validateDerivedValue(context.eu261, (candidate) =>
    assertEnum(candidate, ["applies", "does_not_apply", "unknown"])
  );
  validateDerivedValue(context.uk261, (candidate) =>
    assertEnum(candidate, ["applies", "does_not_apply", "unknown"])
  );
  validateDerivedValue(context.controllability, (candidate) =>
    assertEnum(candidate, ["controllable", "uncontrollable", "unknown"])
  );
  assertUniqueStrings(context.legalRegimes, legalRegimes);
}

function validateFactReview(value: unknown, responseState: ClaimState): void {
  const review = recordWithExactKeys(value, [
    "facts",
    "provenance",
    "conflicts",
    "unresolvedFields"
  ]);
  if (!Array.isArray(review.conflicts)) invalidResponse();
  review.conflicts.forEach((conflictValue) => {
    const conflict = recordWithExactKeys(conflictValue, ["path", "label", "candidates"]);
    if (typeof conflict.path !== "string" || !rawFactPathSet.has(conflict.path)) invalidResponse();
    assertString(conflict.label);
    if (!Array.isArray(conflict.candidates) || conflict.candidates.length !== 2) invalidResponse();
    conflict.candidates.forEach((candidateValue) => {
      const candidate = recordWithExactKeys(candidateValue, ["value", "source"]);
      assertRawFactValue(conflict.path as RawFactPath, candidate.value);
      assertEnum(candidate.source, ["deterministic_extraction", "openai_extraction"]);
    });
  });
  const expectedConflicts = responseState.conflicts.map(({ field, candidates }) => ({
    path: field,
    label: field.replaceAll(".", " "),
    candidates
  }));
  if (
    !structurallyEqual(review.facts, responseState.facts) ||
    !structurallyEqual(review.provenance, responseState.provenance) ||
    !structurallyEqual(review.conflicts, expectedConflicts) ||
    !structurallyEqual(review.unresolvedFields, responseState.unresolvedFields)
  ) {
    invalidResponse();
  }
}

function validateAnalysisResult(value: unknown, responseState: ClaimState): void {
  const result = recordWithExactKeys(value, [
    "status",
    "primaryScenario",
    "scenarioIds",
    "factsRevision",
    "factsUsed",
    "missingFacts",
    "factReview",
    "derivedContext",
    "policyApplicability",
    "extraction",
    "summary",
    "assessments",
    "officialSources",
    "providerCommitments",
    "similarCases",
    "scripts",
    "evidenceStatus",
    "nextActions",
    "cautions",
    "disclaimer"
  ]);
  assertEnum(result.status, workflowStatuses);
  if (result.primaryScenario !== null) assertEnum(result.primaryScenario, scenarioIds);
  assertUniqueStrings(result.scenarioIds, scenarioIds);
  if (
    (result.primaryScenario === null && result.scenarioIds.length > 0) ||
    (result.primaryScenario !== null && !result.scenarioIds.includes(result.primaryScenario))
  ) {
    invalidResponse();
  }
  assertSafeRevision(result.factsRevision);
  if (result.factsRevision !== responseState.revision) invalidResponse();
  if (!Array.isArray(result.factsUsed)) invalidResponse();
  result.factsUsed.forEach(validateFactDisplay);
  if (!Array.isArray(result.missingFacts)) invalidResponse();
  result.missingFacts.forEach(validateMissingFact);
  if (result.factReview !== null) validateFactReview(result.factReview, responseState);
  if (result.derivedContext !== null) validateDerivedContext(result.derivedContext);
  if (!Array.isArray(result.policyApplicability)) invalidResponse();
  result.policyApplicability.forEach(validatePolicyApplicability);
  if (!parseExtractionMetadata(result.extraction).success) invalidResponse();
  assertString(result.summary);
  if (!Array.isArray(result.assessments)) invalidResponse();
  result.assessments.forEach(validateAssessment);
  if (!Array.isArray(result.officialSources)) invalidResponse();
  result.officialSources.forEach(validatePolicySource);
  if (!Array.isArray(result.providerCommitments)) invalidResponse();
  result.providerCommitments.forEach(validatePolicySource);
  if (!Array.isArray(result.similarCases)) invalidResponse();
  result.similarCases.forEach(validateCaseSource);
  if (!Array.isArray(result.scripts)) invalidResponse();
  result.scripts.forEach(validateScript);
  assertEnum(result.evidenceStatus, ["complete", "partial", "missing"]);
  if (!Array.isArray(result.nextActions) || result.nextActions.length > 1) invalidResponse();
  result.nextActions.forEach((actionValue) => {
    const action = recordWithExactKeys(actionValue, ["title", "detail"]);
    if (action.title !== "Next action") invalidResponse();
    assertString(action.detail);
  });
  assertStringArray(result.cautions);
  if (result.disclaimer !== DISCLAIMER) invalidResponse();

  const sourceIds = [
    ...result.officialSources.map((source) => source.id as string),
    ...result.providerCommitments.map((source) => source.id as string)
  ];
  if (new Set(sourceIds).size !== sourceIds.length) invalidResponse();
  result.scripts.forEach((script) => {
    (script.sourceIds as string[]).forEach((sourceId) => {
      if (sourceIds.filter((candidate) => candidate === sourceId).length !== 1) invalidResponse();
    });
  });

  const blocked = result.status === "out_of_scope" || result.status === "unsupported_high_risk";
  if (
    blocked &&
    (result.factReview !== null ||
      result.derivedContext !== null ||
      result.factsUsed.length > 0 ||
      result.missingFacts.length > 0 ||
      result.policyApplicability.length > 0 ||
      result.assessments.length > 0 ||
      result.officialSources.length > 0 ||
      result.providerCommitments.length > 0 ||
      result.similarCases.length > 0 ||
      result.scripts.length > 0 ||
      result.nextActions.length > 0)
  ) {
    invalidResponse();
  }
}

export function parseAnalysisApiError(status: number, value: unknown): AnalysisApiError {
  const generic: AnalysisApiError = {
    status,
    code: "analysis_failed",
    message: GENERIC_ERROR_MESSAGE,
    requestId: null,
    retryable: status >= 500 || status === 429
  };
  if (!isRecord(value) || Object.keys(value).length !== 1 || !isRecord(value.error)) return generic;
  const { error } = value;
  if (
    Object.keys(error).length !== 4 ||
    typeof error.code !== "string" ||
    !(error.code in safeApiErrors) ||
    typeof error.requestId !== "string" ||
    !error.requestId.trim() ||
    error.requestId.length > 128 ||
    typeof error.message !== "string" ||
    typeof error.retryable !== "boolean"
  ) {
    return generic;
  }
  const spec = safeApiErrors[error.code as keyof typeof safeApiErrors];
  if (
    status !== spec.status ||
    error.message !== spec.message ||
    error.retryable !== spec.retryable
  ) {
    return generic;
  }
  return {
    status,
    code: error.code,
    message: spec.message,
    requestId: error.requestId,
    retryable: spec.retryable
  };
}

export function parseAnalyzeClaimResponse(
  value: unknown,
  expectation: AnalyzeResponseExpectation
): AnalyzeClaimResponse {
  const response = recordWithExactKeys(value, ["baseRevision", "claimState", "result"]);
  assertSafeRevision(response.baseRevision);
  if (response.baseRevision !== expectation.baseRevision) invalidResponse();
  const claimState = validateClaimState(response.claimState);
  validateAnalysisResult(response.result, claimState);
  if (
    !isLegalResponseRevision(
      { token: 0, baseRevision: expectation.baseRevision, kind: expectation.requestKind },
      claimState.revision
    )
  ) {
    invalidResponse();
  }
  return structuredClone(value) as AnalyzeClaimResponse;
}

export async function analyzeClaim(
  request: AnalyzeClaimRequest,
  options: AnalyzeClaimOptions
): Promise<AnalyzeClaimResponse> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (request.requestedMode === "gpt" && options.demoAccessCode) {
    headers.set("x-demo-access-code", options.demoAccessCode);
  }
  const response = await (options.fetcher ?? fetch)("/api/analyze", {
    method: "POST",
    headers,
    signal: options.signal,
    body: JSON.stringify(request)
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const parsedError = parseAnalysisApiError(response.status, payload);
    throw Object.assign(new Error(parsedError.message), parsedError);
  }
  return parseAnalyzeClaimResponse(payload, {
    baseRevision: request.baseRevision,
    requestKind: request.correction ? "correction" : "message"
  });
}
