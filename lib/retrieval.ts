import { getIssueAliases, normalizeIssueType } from "./issueTaxonomy";
import { rankCases, rankPolicies, rankScripts } from "./retrievalScoring";
import type {
  Case,
  ExtractedFacts,
  Policy,
  RetrievalLimits,
  RetrievalQuery,
  RetrievalResult,
  Script
} from "./types";

const defaultLimits: Required<RetrievalLimits> = {
  policyLimit: 3,
  caseLimit: 3,
  scriptLimit: 2
};

function isApprovedCase(item: Case): boolean {
  return item.review_status === "approved";
}

function withSelectedCaseFacts(facts: ExtractedFacts, selectedCase?: Case): ExtractedFacts {
  if (!selectedCase) {
    return facts;
  }

  const selectedIssueType = normalizeIssueType(selectedCase.issue_type);

  return {
    ...facts,
    description: facts.description || selectedCase.facts,
    issueType: selectedIssueType ?? facts.issueType,
    provider: selectedCase.provider,
    providerType: selectedCase.provider_type,
    country: selectedCase.location_country,
    bookingChannel: selectedCase.booking_channel,
    loyaltyStatus: selectedCase.loyalty_status,
    confidence: selectedIssueType ? "high" : facts.confidence,
    source: "selected_case"
  };
}

export function buildRetrievalQuery(facts: ExtractedFacts): RetrievalQuery {
  return {
    description: facts.description,
    issueType: facts.issueType,
    provider: facts.provider,
    providerType: facts.providerType,
    country: facts.country,
    bookingChannel: facts.bookingChannel,
    loyaltyStatus: facts.loyaltyStatus,
    disruptionReason: facts.disruptionReason,
    isOvernight: facts.isOvernight,
    deniedBoardingKind: facts.deniedBoardingKind
  };
}

export function searchPolicies(
  query: RetrievalQuery,
  policies: Policy[],
  limit = defaultLimits.policyLimit
): Policy[] {
  return rankPolicies(query, policies)
    .slice(0, limit)
    .map((result) => result.item);
}

export function searchCases(
  query: RetrievalQuery,
  cases: Case[],
  limit = defaultLimits.caseLimit
): Case[] {
  return rankCases(query, cases)
    .slice(0, limit)
    .map((result) => result.item);
}

export function searchScripts(
  query: RetrievalQuery,
  scripts: Script[],
  limit = defaultLimits.scriptLimit
): Script[] {
  return rankScripts(query, scripts)
    .slice(0, limit)
    .map((result) => result.item);
}

export function retrieveKnowledge(
  facts: ExtractedFacts,
  policies: Policy[],
  cases: Case[],
  scripts: Script[],
  limits: RetrievalLimits = {}
): RetrievalResult {
  const selectedCase = facts.caseId
    ? cases.find((item) => isApprovedCase(item) && item.case_id === facts.caseId)
    : undefined;
  const resolvedFacts = withSelectedCaseFacts(facts, selectedCase);
  const query = buildRetrievalQuery(resolvedFacts);

  return {
    facts: resolvedFacts,
    query,
    issueAliases: getIssueAliases(resolvedFacts.issueType),
    officialBasis: searchPolicies(
      query,
      policies,
      limits.policyLimit ?? defaultLimits.policyLimit
    ),
    similarCases: searchCases(query, cases, limits.caseLimit ?? defaultLimits.caseLimit),
    scripts: searchScripts(query, scripts, limits.scriptLimit ?? defaultLimits.scriptLimit),
    selectedCase
  };
}
