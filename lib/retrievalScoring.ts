import { getIssueAliases } from "./issueTaxonomy";
import { normalizeIncidentInput } from "./domain/incident-taxonomy";
import { hasValidCaseSourceDisclosure } from "./knowledge/case-source-disclosure";
import {
  applicabilityRuleMatches,
  policyAppliesToRoute,
  policyRegionsFromCountry
} from "./policyScope";
import { canonicalHotelGroup, providerMatchKey, providersMatch } from "./provider";
import { resolveRetrievalLimits } from "./retrieval-limits";
import type {
  PolicyApplicability,
  RankedDisplayItem,
  ResolvedClaimContext,
  ScenarioId
} from "./domain/claim-contract";
import type {
  Case,
  Policy,
  RetrievalMatchReason,
  RetrievalQuery,
  ScoredRetrievalItem,
  Script
} from "./types";

const stopWords = new Set([
  "about",
  "after",
  "airline",
  "been",
  "before",
  "could",
  "flight",
  "from",
  "hotel",
  "into",
  "more",
  "next",
  "that",
  "their",
  "there",
  "they",
  "this",
  "through",
  "with",
  "would"
]);

const euLocations = new Set([
  "eu",
  "france",
  "germany",
  "italy",
  "spain",
  "netherlands",
  "ireland",
  "portugal",
  "belgium",
  "austria",
  "greece",
  "sweden",
  "denmark",
  "finland",
  "poland",
  "czechia",
  "switzerland",
  "norway",
  "iceland"
]);

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function tokenize(value: string): Set<string> {
  const normalized = normalizeText(value);
  const latinTokens = normalized
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !stopWords.has(token));
  const hanTokens = Array.from(value.matchAll(/[\p{Script=Han}]+/gu)).flatMap(([chunk]) => {
    if (chunk.length <= 2) {
      return [chunk];
    }

    return Array.from({ length: chunk.length - 1 }, (_, index) => chunk.slice(index, index + 2));
  });

  return new Set([...latinTokens, ...hanTokens]);
}

function addScore<T>(
  current: ScoredRetrievalItem<T>,
  points: number,
  reason: RetrievalMatchReason
): ScoredRetrievalItem<T> {
  return {
    ...current,
    score: current.score + points,
    reasons: current.reasons.includes(reason) ? current.reasons : [...current.reasons, reason]
  };
}

function addIssueScore<T>(
  result: ScoredRetrievalItem<T>,
  query: RetrievalQuery,
  issueType: string
): ScoredRetrievalItem<T> {
  if (issueType === query.issueType) {
    return addScore(result, 40, "exact_issue_match");
  }

  return addScore(result, 25, "issue_alias_match");
}

function addProviderScore<T>(
  result: ScoredRetrievalItem<T>,
  queryProvider: string | undefined,
  candidateProvider: string
): ScoredRetrievalItem<T> {
  const normalizedCandidate = providerMatchKey(candidateProvider);

  if (normalizedCandidate.startsWith("generic")) {
    return addScore(result, 10, "generic_provider_match");
  }

  if (!queryProvider) {
    return result;
  }

  const normalizedQuery = providerMatchKey(queryProvider);
  if (!normalizedQuery || !normalizedCandidate) {
    return result;
  }

  if (normalizedQuery === normalizedCandidate) {
    return addScore(result, 20, "provider_exact_match");
  }

  if (
    normalizedCandidate.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedCandidate)
  ) {
    return addScore(result, 12, "provider_partial_match");
  }

  return result;
}

function locationsMatch(queryCountry: string, candidateCountry: string): boolean {
  const normalizedQuery = normalizeText(queryCountry);
  const normalizedCandidate = normalizeText(candidateCountry);

  if (normalizedQuery === normalizedCandidate) {
    return true;
  }

  return normalizedQuery === "eu" && euLocations.has(normalizedCandidate);
}

function addDescriptionOverlap<T>(
  result: ScoredRetrievalItem<T>,
  description: string,
  candidateText: string
): ScoredRetrievalItem<T> {
  const queryTokens = tokenize(description);
  if (queryTokens.size === 0) {
    return result;
  }

  const candidateTokens = tokenize(candidateText);
  const overlapCount = Array.from(queryTokens).filter((token) => candidateTokens.has(token)).length;
  if (overlapCount > 0) {
    return addScore(result, Math.min(15, overlapCount * 3), "description_overlap");
  }

  return result;
}

function candidateHasDisruptionReason(
  reason: RetrievalQuery["disruptionReason"],
  candidateText: string
): boolean {
  if (!reason || reason === "unknown") {
    return false;
  }

  const normalized = normalizeText(candidateText);
  const terms: Record<
    Exclude<NonNullable<RetrievalQuery["disruptionReason"]>, "unknown">,
    string[]
  > = {
    crew: ["crew", "机组"],
    mechanical: ["mechanical", "maintenance", "equipment", "technical", "机械", "故障"],
    oversales: ["oversold", "overbooked", "oversales", "bump", "超售"],
    weather: ["weather", "storm", "snow", "天气", "暴雪"],
    late_inbound_aircraft: [
      "late inbound",
      "late-arriving aircraft",
      "incoming aircraft",
      "previous flight arrived late",
      "前序航班晚到",
      "进港飞机晚到"
    ],
    other_controllable: ["controllable", "airline control", "航司原因", "可控原因"]
  };

  return terms[reason].some((term) => normalized.includes(normalizeText(term)));
}

function detectDeniedBoardingKind(candidateText: string): RetrievalQuery["deniedBoardingKind"] {
  const normalized = normalizeText(candidateText);
  if (
    normalized.includes("involuntary") ||
    normalized.includes("involuntarily") ||
    normalized.includes("did not volunteer") ||
    normalized.includes("非自愿")
  ) {
    return "involuntary";
  }

  if (
    normalized.includes("voluntary bump") ||
    normalized.includes("volunteer my seat") ||
    normalized.includes("asked for volunteers") ||
    normalized.includes("征集自愿者")
  ) {
    return "voluntary";
  }

  return "unknown";
}

function sortScoredItems<T>(
  items: ScoredRetrievalItem<T>[],
  getStableId: (item: T) => string
): ScoredRetrievalItem<T>[] {
  return items.sort(
    (left, right) =>
      right.score - left.score || getStableId(left.item).localeCompare(getStableId(right.item))
  );
}

function jurisdictionScore(
  applicableRegions: Policy["applicable_regions"],
  query: RetrievalQuery
): number {
  if (query.originRegion && applicableRegions.includes(query.originRegion)) {
    return 20;
  }
  if (query.destinationRegion && applicableRegions.includes(query.destinationRegion)) {
    return 12;
  }
  return 15;
}

function legacyRankCases(
  query: RetrievalQuery,
  cases: readonly Case[],
  skipEligibility = false
): ScoredRetrievalItem<Case>[] {
  const aliases = new Set<string>(getIssueAliases(query.issueType));
  const queryHotelGroup =
    query.providerType === "hotel" ? canonicalHotelGroup(query.provider) : undefined;
  const candidates = cases.filter((item) => {
    if (skipEligibility) return true;
    if (item.review_status !== "approved" || !aliases.has(item.issue_type)) {
      return false;
    }
    if (queryHotelGroup) {
      const caseHotelGroup =
        canonicalHotelGroup(item.provider) ?? canonicalHotelGroup(item.brand_or_airline);
      return item.provider_type === "hotel" && caseHotelGroup === queryHotelGroup;
    }
    if (item.provider_type !== "airline" || query.policyRegions.length === 0) {
      return true;
    }

    const caseRegions = policyRegionsFromCountry(item.location_country);
    return caseRegions.some((region) => query.policyRegions.includes(region));
  });

  const scored = candidates.map((item) => {
    let result: ScoredRetrievalItem<Case> = { item, score: 0, reasons: [] };
    const candidateText = [
      item.provider,
      item.brand_or_airline,
      item.facts,
      item.actual_outcome,
      item.evidence_used.join(" "),
      item.reusable_lesson
    ].join(" ");

    result = addIssueScore(result, query, item.issue_type);
    result = addProviderScore(result, query.provider, item.provider);

    if (query.providerType === item.provider_type) {
      result = addScore(result, 8, "provider_type_match");
    }
    if (query.country && locationsMatch(query.country, item.location_country)) {
      result = addScore(result, 8, "country_match");
    }
    if (
      policyRegionsFromCountry(item.location_country).some((region) =>
        query.policyRegions.includes(region)
      )
    ) {
      result = addScore(result, 15, "jurisdiction_match");
    }
    if (query.bookingChannel && query.bookingChannel === item.booking_channel) {
      result = addScore(result, 5, "booking_channel_match");
    }
    if (
      query.loyaltyStatus &&
      normalizeText(item.loyalty_status).includes(normalizeText(query.loyaltyStatus))
    ) {
      result = addScore(result, 4, "loyalty_status_match");
    }
    if (candidateHasDisruptionReason(query.disruptionReason, candidateText)) {
      result = addScore(result, 8, "disruption_reason_match");
    }
    if (
      query.deniedBoardingKind &&
      query.deniedBoardingKind !== "unknown" &&
      query.deniedBoardingKind === detectDeniedBoardingKind(candidateText)
    ) {
      result = addScore(result, 10, "denied_boarding_kind_match");
    }

    result = addDescriptionOverlap(result, query.description, candidateText);

    if (item.confidence === "high") {
      result = addScore(result, 3, "confidence_match");
    } else if (item.confidence === "medium") {
      result = addScore(result, 1, "confidence_match");
    }

    return result;
  });

  return sortScoredItems(scored, (item) => item.case_id);
}

export function rankPolicies(
  query: RetrievalQuery,
  policies: Policy[]
): ScoredRetrievalItem<Policy>[] {
  const candidates = policies.filter((policy) => {
    const incidentMatches = policy.incident_types.some(
      (incidentType) => incidentType === query.issueType
    );
    const regionMatches = policyAppliesToRoute(policy, query);
    const providerMatches =
      policy.applicable_providers.length === 0 ||
      (query.provider
        ? policy.applicable_providers.some((provider) => providersMatch(provider, query.provider))
        : false);
    const controllabilityMatches =
      policy.required_controllability === "any" ||
      policy.required_controllability === query.controllability;

    return incidentMatches && regionMatches && providerMatches && controllabilityMatches;
  });
  return scorePolicies(query, candidates);
}

function scorePolicies(
  query: RetrievalQuery,
  policies: readonly Policy[]
): ScoredRetrievalItem<Policy>[] {
  const scored = policies.map((policy) => {
    let result: ScoredRetrievalItem<Policy> = { item: policy, score: 0, reasons: [] };
    const candidateText = [
      policy.provider,
      policy.policy_name,
      policy.summary,
      policy.applicable_conditions.join(" "),
      policy.compensation_or_rights.join(" ")
    ].join(" ");

    result = addIssueScore(result, query, query.issueType);
    result = addProviderScore(result, query.provider, policy.provider);
    result = addDescriptionOverlap(result, query.description, candidateText);

    if (policyAppliesToRoute(policy, query) && !policy.applicable_regions.includes("global")) {
      result = addScore(
        result,
        jurisdictionScore(policy.applicable_regions, query),
        "jurisdiction_match"
      );
    }
    if (policy.applicable_providers.length > 0) {
      result = addScore(result, 12, "provider_scope_match");
    }
    if (policy.required_controllability !== "any") {
      result = addScore(result, 10, "controllability_match");
    }

    if (policy.authority_level === "high") {
      result = addScore(result, 5, "authority_match");
    } else if (policy.authority_level === "medium") {
      result = addScore(result, 2, "authority_match");
    }

    return result;
  });

  return sortScoredItems(scored, (item) => item.policy_id);
}

function legacyRankScripts(
  query: RetrievalQuery,
  scripts: readonly Script[],
  skipEligibility = false
): ScoredRetrievalItem<Script>[] {
  const candidates = scripts.filter((script) => {
    if (skipEligibility) return true;
    const incidentMatches = script.incident_types.some(
      (incidentType) => incidentType === query.issueType
    );
    const regionMatches = applicabilityRuleMatches(
      script.applicability_rule,
      script.applicable_regions,
      query
    );
    const normalizedScriptProvider = providerMatchKey(script.provider);
    const providerMatches =
      normalizedScriptProvider.startsWith("generic") ||
      (query.provider ? providersMatch(query.provider, script.provider) : false);
    const controllabilityMatches =
      script.required_controllability === "any" ||
      script.required_controllability === query.controllability;

    return incidentMatches && regionMatches && providerMatches && controllabilityMatches;
  });
  const scored = candidates.map((script) => {
    let result: ScoredRetrievalItem<Script> = { item: script, score: 0, reasons: [] };

    result = addIssueScore(result, query, query.issueType);
    result = addProviderScore(result, query.provider, script.provider);
    result = addDescriptionOverlap(
      result,
      query.description,
      [script.provider, script.template, script.when_to_use].join(" ")
    );

    if (
      applicabilityRuleMatches(script.applicability_rule, script.applicable_regions, query) &&
      !script.applicable_regions.includes("global")
    ) {
      result = addScore(
        result,
        jurisdictionScore(script.applicable_regions, query),
        "jurisdiction_match"
      );
    }
    if (script.required_controllability !== "any") {
      result = addScore(result, 10, "controllability_match");
    }

    return result;
  });

  return sortScoredItems(scored, (item) => item.script_id);
}

function currentProviderForRetrieval(context: ResolvedClaimContext): string | undefined {
  return context.normalizedOperatingCarrier.value ?? context.normalizedProvider.value ?? undefined;
}

function queryFromContext(context: ResolvedClaimContext): RetrievalQuery {
  const origin = context.jurisdiction.originRegion.value ?? undefined;
  const destination = context.jurisdiction.destinationRegion.value ?? undefined;
  return {
    description: "",
    issueType: context.resolutionFacts.incidentType ?? "unknown",
    provider: currentProviderForRetrieval(context),
    providerType: context.resolutionFacts.providerType ?? undefined,
    country:
      context.resolutionFacts.origin.country ??
      context.resolutionFacts.destination.country ??
      undefined,
    bookingChannel: context.resolutionFacts.bookingChannel ?? undefined,
    loyaltyStatus: context.resolutionFacts.loyaltyStatus ?? undefined,
    disruptionReason:
      context.resolutionFacts.reasonCategory === "other_uncontrollable"
        ? "unknown"
        : (context.resolutionFacts.reasonCategory ?? undefined),
    isOvernight: context.resolutionFacts.isOvernight ?? undefined,
    deniedBoardingKind: context.resolutionFacts.deniedBoardingKind ?? undefined,
    operatingCarrier: context.normalizedOperatingCarrier.value ?? undefined,
    operatingCarrierRegion: context.jurisdiction.operatingCarrierRegion.value ?? undefined,
    originRegion: origin,
    destinationRegion: destination,
    policyRegions: [
      ...new Set(
        [origin, destination].filter((item): item is NonNullable<typeof item> => Boolean(item))
      )
    ],
    controllability: context.controllability.value
  };
}

export function scenariosForIncident(value: string): readonly ScenarioId[] {
  const normalized = normalizeIncidentInput(value)?.incident;
  if (normalized === "hotel_walk") return ["marriott_hotel_walk"];
  if (normalized === "denied_boarding") return ["us_denied_boarding"];
  if (normalized === "airline_delay" || normalized === "airline_cancellation") {
    return ["us_airline_disruption", "eu_uk_air_disruption"];
  }
  return [];
}

const GENERIC_PROVIDER_SENTINELS = new Set([
  "generic us airline",
  "european union",
  "generic_airline",
  "generic_hotel"
]);

function comparableProviderKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase("en-US");
  if (!normalized || GENERIC_PROVIDER_SENTINELS.has(normalized)) return null;
  return providerMatchKey(value);
}

export function caseComparabilityKey(context: ResolvedClaimContext, item: Case): string | null {
  const scenario = context.scenarios.scenarioIds.find((active) =>
    scenariosForIncident(item.issue_type).includes(active)
  );
  if (!scenario) return null;
  const provider = comparableProviderKey(item.provider);
  const currentProvider = comparableProviderKey(currentProviderForRetrieval(context));
  if (provider && currentProvider && provider !== currentProvider) return null;
  return `${scenario}:${provider && currentProvider ? provider : "any"}`;
}

function caseSourceTier(item: Case): number {
  if (item.source_type === "community_dp") return 0;
  if (item.source_type === "user_submitted") return 1;
  return 2;
}

export function rankCases(query: RetrievalQuery, cases: Case[]): ScoredRetrievalItem<Case>[];
export function rankCases(
  context: ResolvedClaimContext,
  cases: readonly Case[],
  limit: number
): RankedDisplayItem<Case>[];
export function rankCases(
  queryOrContext: RetrievalQuery | ResolvedClaimContext,
  cases: readonly Case[],
  limit?: number
): ScoredRetrievalItem<Case>[] | RankedDisplayItem<Case>[] {
  if (!("resolutionFacts" in queryOrContext)) return legacyRankCases(queryOrContext, cases);
  const context = queryOrContext;
  const candidates = cases.flatMap((item) => {
    const comparabilityKey = caseComparabilityKey(context, item);
    if (
      !comparabilityKey ||
      item.review_status !== "approved" ||
      !hasValidCaseSourceDisclosure(item)
    ) {
      return [];
    }
    return [{ item, comparabilityKey }];
  });
  const scores = new Map(
    legacyRankCases(
      queryFromContext(context),
      candidates.map(({ item }) => item),
      true
    ).map((item) => [item.item.case_id, item])
  );
  const { caseLimit } = resolveRetrievalLimits({ caseLimit: limit });
  return candidates
    .map(({ item, comparabilityKey }) => ({ ...scores.get(item.case_id)!, comparabilityKey }))
    .sort((left, right) =>
      left.comparabilityKey === right.comparabilityKey
        ? caseSourceTier(left.item) - caseSourceTier(right.item) ||
          right.score - left.score ||
          left.item.case_id.localeCompare(right.item.case_id)
        : right.score - left.score ||
          left.comparabilityKey.localeCompare(right.comparabilityKey) ||
          left.item.case_id.localeCompare(right.item.case_id)
    )
    .slice(0, caseLimit)
    .map(({ item, score, reasons }) => ({ item, score, reasons }));
}

export function rankApplicablePolicies(
  context: ResolvedClaimContext,
  assessments: readonly PolicyApplicability[],
  limit: number
): RankedDisplayItem<Policy>[] {
  const { policyLimit } = resolveRetrievalLimits({ policyLimit: limit });
  const query = queryFromContext(context);
  const scored = assessments
    .filter(({ status }) => status === "applicable" || status === "conditional")
    .map(({ policy }) => scorePolicies(query, [policy])[0]!);
  return sortScoredItems(scored, (item) => item.policy_id).slice(0, policyLimit);
}

function scriptProviderMatches(context: ResolvedClaimContext, script: Script): boolean {
  const scriptProvider = comparableProviderKey(script.provider);
  if (scriptProvider === null) return true;
  const currentProvider = comparableProviderKey(currentProviderForRetrieval(context));
  return currentProvider !== null && scriptProvider === currentProvider;
}

export function rankScripts(
  query: RetrievalQuery,
  scripts: Script[]
): ScoredRetrievalItem<Script>[];
export function rankScripts(
  context: ResolvedClaimContext,
  scripts: readonly Script[],
  admissiblePolicyIds: ReadonlySet<string>,
  limit: number
): RankedDisplayItem<Script>[];
export function rankScripts(
  queryOrContext: RetrievalQuery | ResolvedClaimContext,
  scripts: readonly Script[],
  admissiblePolicyIds?: ReadonlySet<string>,
  limit?: number
): ScoredRetrievalItem<Script>[] | RankedDisplayItem<Script>[] {
  if (!("resolutionFacts" in queryOrContext)) return legacyRankScripts(queryOrContext, scripts);
  const context = queryOrContext;
  const query = queryFromContext(context);
  const candidates = scripts.filter(
    (script) =>
      script.source_ids.length > 0 &&
      script.source_ids.every((sourceId) => admissiblePolicyIds?.has(sourceId)) &&
      script.incident_types.includes(query.issueType as Script["incident_types"][number]) &&
      applicabilityRuleMatches(script.applicability_rule, script.applicable_regions, query) &&
      scriptProviderMatches(context, script) &&
      (script.required_controllability === "any" ||
        script.required_controllability === query.controllability)
  );
  const { scriptLimit } = resolveRetrievalLimits({ scriptLimit: limit });
  return legacyRankScripts(query, candidates, true).slice(0, scriptLimit);
}
