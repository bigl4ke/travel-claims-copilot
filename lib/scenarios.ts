import {
  getIssueAliases,
  isMvpIssueType,
  issueLabels,
  normalizeIssueType
} from "./issueTaxonomy";
import type { Case, IssueType, Policy, ScenarioSummary, Script } from "./types";

function getKnownIssueTypes(cases: Case[]): IssueType[] {
  return Array.from(
    new Set(cases.filter((item) => item.review_status === "approved").map((item) => item.issue_type))
  )
    .map(normalizeIssueType)
    .filter((issueType): issueType is IssueType => Boolean(issueType))
    .filter(isMvpIssueType);
}

export function buildScenarioSummaries(
  policies: Policy[],
  cases: Case[],
  scripts: Script[]
): ScenarioSummary[] {
  const approvedCases = cases.filter((item) => item.review_status === "approved");

  return getKnownIssueTypes(approvedCases)
    .map((issueType) => {
      const aliases = new Set<string>(getIssueAliases(issueType));
      const matchingCases = approvedCases.filter((item) => aliases.has(item.issue_type));
      const matchingPolicies = policies.filter((policy) => aliases.has(policy.issue_type));
      const matchingScripts = scripts.filter((script) => aliases.has(script.issue_type));
      const providers = Array.from(new Set(matchingCases.map((item) => item.provider))).sort();
      const sampleCase = matchingCases[0];

      return {
        issueType,
        label: issueLabels[issueType],
        caseCount: matchingCases.length,
        officialBasisCount: matchingPolicies.length,
        scriptCount: matchingScripts.length,
        providers,
        sampleCase: sampleCase
          ? {
              caseId: sampleCase.case_id,
              provider: sampleCase.provider,
              brandOrAirline: sampleCase.brand_or_airline,
              facts: sampleCase.facts
            }
          : undefined
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}
