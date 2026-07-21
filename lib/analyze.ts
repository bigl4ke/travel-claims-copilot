import { deterministicFactExtractor } from "./classifier";
import { buildActionPlan } from "./actionPlan";
import { generateAnalysis } from "./generator";
import { buildHandlingPlaybook } from "./handlingPlaybook";
import { controllabilityFromReason } from "./policyScope";
import { retrieveKnowledge } from "./retrieval";
import type { ClaimFacts } from "./claimFacts";
import type {
  AnalysisResult,
  AnalyzeOptions,
  Case,
  ExtractedFacts,
  PolicyRegion,
  Policy,
  Script
} from "./types";
import type { FactExtractor } from "./classifier";

export {
  classifyInput,
  classifyIssue,
  DeterministicFactExtractor,
  deterministicFactExtractor
} from "./classifier";
export type { FactExtractor } from "./classifier";
export { generateAnalysis } from "./generator";
export {
  getIssueAliases,
  isMvpIssueType,
  issueLabels,
  MVP_ISSUE_TYPES,
  normalizeIssueType
} from "./issueTaxonomy";
export {
  buildRetrievalQuery,
  retrieveKnowledge,
  searchCases,
  searchPolicies,
  searchScripts
} from "./retrieval";
export { rankCases, rankPolicies, rankScripts } from "./retrievalScoring";
export { buildScenarioSummaries } from "./scenarios";

function policyRegionsFromClaimFacts(facts: ClaimFacts): PolicyRegion[] {
  return Array.from(
    new Set(
      [facts.origin.region, facts.destination.region].filter(
        (region): region is NonNullable<typeof region> => Boolean(region)
      )
    )
  );
}

export function claimFactsToExtractedFacts(facts: ClaimFacts, description = ""): ExtractedFacts {
  return {
    description,
    issueType: facts.issueType,
    provider: facts.provider ?? facts.operatingCarrier ?? undefined,
    providerType: facts.providerType === "unknown" ? undefined : facts.providerType,
    country: facts.origin.country ?? facts.destination.country ?? undefined,
    bookingChannel: facts.bookingChannel === "unknown" ? undefined : facts.bookingChannel,
    loyaltyStatus: facts.loyaltyStatus ?? undefined,
    disruptionReason: facts.disruptionReason,
    arrivalDelayMinutes: facts.arrivalDelayMinutes ?? undefined,
    isOvernight: facts.isOvernight ?? undefined,
    deniedBoardingKind: facts.deniedBoardingKind,
    operatingCarrier: facts.operatingCarrier ?? facts.provider ?? undefined,
    operatingCarrierRegion: facts.operatingCarrierRegion ?? undefined,
    originRegion: facts.origin.region ?? undefined,
    destinationRegion: facts.destination.region ?? undefined,
    policyRegions: policyRegionsFromClaimFacts(facts),
    controllability: controllabilityFromReason(facts.disruptionReason),
    confidence: facts.confidence,
    signals: [],
    source: "llm"
  };
}

export type AnalysisDependencies = {
  factExtractor?: FactExtractor;
};

export async function buildAnalysisResult(
  description: string,
  policies: Policy[],
  cases: Case[],
  scripts: Script[],
  options: AnalyzeOptions = {},
  dependencies: AnalysisDependencies = {}
): Promise<AnalysisResult> {
  const factExtractor = dependencies.factExtractor ?? deterministicFactExtractor;
  const facts = await factExtractor.extract(description, options);
  const retrieval = retrieveKnowledge(facts, policies, cases, scripts);

  return generateAnalysis(retrieval.facts, retrieval);
}

export function buildAnalysisFromFacts(
  facts: ClaimFacts,
  policies: Policy[],
  cases: Case[],
  scripts: Script[],
  description = ""
): AnalysisResult {
  const extractedFacts = claimFactsToExtractedFacts(facts, description);
  const retrieval = retrieveKnowledge(extractedFacts, policies, cases, scripts);
  const analysis = generateAnalysis(retrieval.facts, retrieval);
  const handlingPlaybook = buildHandlingPlaybook(facts);

  return {
    ...analysis,
    handlingPlaybook,
    actionPlan: buildActionPlan(facts, analysis, handlingPlaybook)
  };
}
