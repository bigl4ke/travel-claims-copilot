import { getIssueAliases } from "./issueTaxonomy";
import { controllabilityFromReason, policyRegionsFromCountry } from "./policyScope";
import { resolveRetrievalLimits } from "./retrieval-limits";
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

function isApprovedCase(item: Case): boolean {
  return item.review_status === "approved";
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
    deniedBoardingKind: facts.deniedBoardingKind,
    operatingCarrier: facts.operatingCarrier ?? facts.provider,
    operatingCarrierRegion: facts.operatingCarrierRegion,
    originRegion: facts.originRegion,
    destinationRegion: facts.destinationRegion,
    policyRegions:
      facts.policyRegions && facts.policyRegions.length > 0
        ? Array.from(new Set(facts.policyRegions))
        : policyRegionsFromCountry(facts.country),
    controllability: facts.controllability ?? controllabilityFromReason(facts.disruptionReason)
  };
}

export function searchPolicies(
  query: RetrievalQuery,
  policies: Policy[],
  limit?: number
): Policy[] {
  const { policyLimit } = resolveRetrievalLimits({ policyLimit: limit });
  return rankPolicies(query, policies)
    .slice(0, policyLimit)
    .map((result) => result.item);
}

export function searchCases(query: RetrievalQuery, cases: Case[], limit?: number): Case[] {
  const { caseLimit } = resolveRetrievalLimits({ caseLimit: limit });
  return rankCases(query, cases)
    .slice(0, caseLimit)
    .map((result) => result.item);
}

export function searchScripts(query: RetrievalQuery, scripts: Script[], limit?: number): Script[] {
  const { scriptLimit } = resolveRetrievalLimits({ scriptLimit: limit });
  return rankScripts(query, scripts)
    .slice(0, scriptLimit)
    .map((result) => result.item);
}

export function retrieveKnowledge(
  facts: ExtractedFacts,
  policies: Policy[],
  cases: Case[],
  scripts: Script[],
  limits: RetrievalLimits = {}
): RetrievalResult {
  const resolvedLimits = resolveRetrievalLimits(limits);
  const selectedCase = facts.caseId
    ? cases.find((item) => isApprovedCase(item) && item.case_id === facts.caseId)
    : undefined;
  const query = buildRetrievalQuery(facts);

  return {
    facts,
    query,
    issueAliases: getIssueAliases(facts.issueType),
    officialBasis: searchPolicies(query, policies, resolvedLimits.policyLimit),
    similarCases: searchCases(query, cases, resolvedLimits.caseLimit),
    scripts: searchScripts(query, scripts, resolvedLimits.scriptLimit),
    legalRegimes: Array.from(
      new Set(rankPolicies(query, policies).map(({ item }) => item.legal_regime))
    ),
    selectedCase
  };
}
