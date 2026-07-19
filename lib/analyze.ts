import { deterministicFactExtractor } from "./classifier";
import { processClaimTurn } from "./claim-workflow";
import { generateAnalysis } from "./generator";
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
export { evaluateActiveScenarios, processClaimTurn } from "./claim-workflow";
export {
  assessPolicyApplicability,
  buildRetrievalTrace,
  buildUnrankedRetrievalTrace,
  regimesFromApplicability
} from "./domain/policy-applicability";
export { statusFromConditions, topLevelStatus } from "./domain/remedy-assessment";
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
export {
  caseComparabilityKey,
  rankApplicablePolicies,
  rankCases,
  rankPolicies,
  rankScripts,
  scenariosForIncident
} from "./retrievalScoring";
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

export const buildAnalysisFromFacts = processClaimTurn;
