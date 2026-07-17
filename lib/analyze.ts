import { deterministicFactExtractor } from "./classifier";
import { generateAnalysis } from "./generator";
import { retrieveKnowledge } from "./retrieval";
import type { AnalysisResult, AnalyzeOptions, Case, Policy, Script } from "./types";
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
