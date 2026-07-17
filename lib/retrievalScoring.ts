import { getIssueAliases } from "./issueTaxonomy";
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

function normalizeProvider(value: string): string {
  return normalizeText(value)
    .replace(/\b(airline|airlines|air lines|hotel|hotels|resort|resorts)\b/g, " ")
    .replace(/\s+/g, " ")
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

function addScore(
  current: ScoredRetrievalItem<unknown>,
  points: number,
  reason: RetrievalMatchReason
): void {
  current.score += points;
  if (!current.reasons.includes(reason)) {
    current.reasons.push(reason);
  }
}

function addIssueScore<T>(result: ScoredRetrievalItem<T>, query: RetrievalQuery, issueType: string) {
  if (issueType === query.issueType) {
    addScore(result, 40, "exact_issue_match");
  } else {
    addScore(result, 25, "issue_alias_match");
  }
}

function addProviderScore<T>(
  result: ScoredRetrievalItem<T>,
  queryProvider: string | undefined,
  candidateProvider: string
) {
  const normalizedCandidate = normalizeProvider(candidateProvider);

  if (normalizedCandidate.startsWith("generic")) {
    addScore(result, 10, "generic_provider_match");
    return;
  }

  if (!queryProvider) {
    return;
  }

  const normalizedQuery = normalizeProvider(queryProvider);
  if (!normalizedQuery || !normalizedCandidate) {
    return;
  }

  if (normalizedQuery === normalizedCandidate) {
    addScore(result, 20, "provider_exact_match");
    return;
  }

  if (
    normalizedCandidate.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedCandidate)
  ) {
    addScore(result, 12, "provider_partial_match");
  }
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
) {
  const queryTokens = tokenize(description);
  if (queryTokens.size === 0) {
    return;
  }

  const candidateTokens = tokenize(candidateText);
  const overlapCount = Array.from(queryTokens).filter((token) => candidateTokens.has(token)).length;
  if (overlapCount > 0) {
    addScore(result, Math.min(15, overlapCount * 3), "description_overlap");
  }
}

function candidateHasDisruptionReason(
  reason: RetrievalQuery["disruptionReason"],
  candidateText: string
): boolean {
  if (!reason || reason === "unknown") {
    return false;
  }

  const normalized = normalizeText(candidateText);
  const terms: Record<Exclude<NonNullable<RetrievalQuery["disruptionReason"]>, "unknown">, string[]> = {
    crew: ["crew", "机组"],
    mechanical: ["mechanical", "maintenance", "equipment", "technical", "机械", "故障"],
    oversales: ["oversold", "overbooked", "oversales", "bump", "超售"],
    weather: ["weather", "storm", "snow", "天气", "暴雪"],
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
    (left, right) => right.score - left.score || getStableId(left.item).localeCompare(getStableId(right.item))
  );
}

export function rankCases(
  query: RetrievalQuery,
  cases: Case[]
): ScoredRetrievalItem<Case>[] {
  const aliases = new Set<string>(getIssueAliases(query.issueType));
  const candidates = cases.filter(
    (item) => item.review_status === "approved" && aliases.has(item.issue_type)
  );

  const scored = candidates.map((item) => {
    const result: ScoredRetrievalItem<Case> = { item, score: 0, reasons: [] };
    const candidateText = [
      item.provider,
      item.brand_or_airline,
      item.facts,
      item.actual_outcome,
      item.evidence_used.join(" "),
      item.reusable_lesson
    ].join(" ");

    addIssueScore(result, query, item.issue_type);
    addProviderScore(result, query.provider, item.provider);

    if (query.providerType === item.provider_type) {
      addScore(result, 8, "provider_type_match");
    }
    if (query.country && locationsMatch(query.country, item.location_country)) {
      addScore(result, 8, "country_match");
    }
    if (query.bookingChannel && query.bookingChannel === item.booking_channel) {
      addScore(result, 5, "booking_channel_match");
    }
    if (
      query.loyaltyStatus &&
      normalizeText(item.loyalty_status).includes(normalizeText(query.loyaltyStatus))
    ) {
      addScore(result, 4, "loyalty_status_match");
    }
    if (candidateHasDisruptionReason(query.disruptionReason, candidateText)) {
      addScore(result, 8, "disruption_reason_match");
    }
    if (
      query.deniedBoardingKind &&
      query.deniedBoardingKind !== "unknown" &&
      query.deniedBoardingKind === detectDeniedBoardingKind(candidateText)
    ) {
      addScore(result, 10, "denied_boarding_kind_match");
    }

    addDescriptionOverlap(result, query.description, candidateText);

    if (item.confidence === "high") {
      addScore(result, 3, "confidence_match");
    } else if (item.confidence === "medium") {
      addScore(result, 1, "confidence_match");
    }

    return result;
  });

  return sortScoredItems(scored, (item) => item.case_id);
}

export function rankPolicies(
  query: RetrievalQuery,
  policies: Policy[]
): ScoredRetrievalItem<Policy>[] {
  const aliases = new Set<string>(getIssueAliases(query.issueType));
  const candidates = policies.filter((policy) => aliases.has(policy.issue_type));
  const scored = candidates.map((policy) => {
    const result: ScoredRetrievalItem<Policy> = { item: policy, score: 0, reasons: [] };
    const candidateText = [
      policy.provider,
      policy.policy_name,
      policy.summary,
      policy.applicable_conditions.join(" "),
      policy.compensation_or_rights.join(" ")
    ].join(" ");

    addIssueScore(result, query, policy.issue_type);
    addProviderScore(result, query.provider, policy.provider);
    addDescriptionOverlap(result, query.description, candidateText);

    if (policy.authority_level === "high") {
      addScore(result, 5, "authority_match");
    } else if (policy.authority_level === "medium") {
      addScore(result, 2, "authority_match");
    }

    return result;
  });

  return sortScoredItems(scored, (item) => item.policy_id);
}

export function rankScripts(
  query: RetrievalQuery,
  scripts: Script[]
): ScoredRetrievalItem<Script>[] {
  const aliases = new Set<string>(getIssueAliases(query.issueType));
  const candidates = scripts.filter((script) => aliases.has(script.issue_type));
  const scored = candidates.map((script) => {
    const result: ScoredRetrievalItem<Script> = { item: script, score: 0, reasons: [] };

    addIssueScore(result, query, script.issue_type);
    addProviderScore(result, query.provider, script.provider);
    addDescriptionOverlap(
      result,
      query.description,
      [script.provider, script.template, script.when_to_use].join(" ")
    );

    return result;
  });

  return sortScoredItems(scored, (item) => item.script_id);
}
