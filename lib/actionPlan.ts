import { buildHandlingPlaybook } from "./handlingPlaybook";
import { providersMatch } from "./provider";
import type { ClaimFacts } from "./claimFacts";
import type {
  ActionPlan,
  ActionReference,
  AnalysisResult,
  HandlingPlaybook,
  PolicyApplicabilityAssessment
} from "./types";

type ActionPlanAnalysis = Pick<
  AnalysisResult,
  "officialBasis" | "policyAssessments" | "similarCases" | "evidenceChecklist"
>;

const MAX_REFERENCES = 5;
const MAX_EVIDENCE_ITEMS = 5;
const MAX_UNCERTAINTIES = 3;

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function contactLabel(playbook: HandlingPlaybook): string {
  return playbook.contactFirst.name ?? playbook.contactFirst.role.replaceAll("_", " ");
}

function headlineFor(playbook: HandlingPlaybook): string {
  const contact = contactLabel(playbook);
  if (playbook.status === "needs_context") {
    return "One more trip detail is needed before choosing who can act.";
  }

  switch (playbook.situation) {
    case "hotel_walk":
      return `Ask ${contact} to secure a comparable room now.`;
    case "close_in_irrops":
      return `Ask ${contact} to restore your trip before discussing compensation.`;
    case "planned_schedule_change":
      return `Ask ${contact} to protect the itinerary you actually need.`;
    case "completed_disruption":
      return `Send ${contact} one documented written claim.`;
    default:
      return "Confirm the missing context before taking action.";
  }
}

function assessmentByPolicyId(
  assessments: PolicyApplicabilityAssessment[]
): Map<string, PolicyApplicabilityAssessment> {
  return new Map(assessments.map((assessment) => [assessment.policyId, assessment]));
}

function officialReferences(analysis: ActionPlanAnalysis): ActionReference[] {
  const assessments = assessmentByPolicyId(analysis.policyAssessments);
  return analysis.officialBasis.slice(0, 3).map((policy) => {
    const status = assessments.get(policy.policy_id)?.status;
    return {
      id: policy.policy_id,
      title: policy.policy_name,
      url: policy.source_url,
      kind: "official",
      note:
        status === "met"
          ? "Official source matching the currently known scope facts."
          : "Official source to check; one or more eligibility conditions remain unresolved."
    };
  });
}

function communityReferences(facts: ClaimFacts, analysis: ActionPlanAnalysis): ActionReference[] {
  if (!facts.provider) return [];

  return analysis.similarCases
    .filter(
      (item) =>
        providersMatch(facts.provider, item.provider) ||
        providersMatch(facts.provider, item.brand_or_airline)
    )
    .slice(0, 2)
    .map((item) => ({
      id: item.case_id,
      title: `${item.brand_or_airline}: reported traveler experience`,
      url: item.source_url,
      kind: "community" as const,
      note: "Reviewed community experience for negotiation context only; not an entitlement."
    }))
    .filter((reference) => Boolean(reference.url));
}

function unresolvedPolicyConditions(analysis: ActionPlanAnalysis): string[] {
  return analysis.policyAssessments.flatMap((assessment) =>
    assessment.conditions
      .filter((condition) => condition.status === "unknown")
      .map((condition) => condition.detail)
  );
}

function evidenceForCurrentStage(
  facts: ClaimFacts,
  analysis: ActionPlanAnalysis,
  playbook: HandlingPlaybook
): string[] {
  if (facts.issueType === "denied_boarding" || playbook.situation === "hotel_walk") {
    return analysis.evidenceChecklist;
  }
  if (playbook.situation === "close_in_irrops") {
    return [
      "Current ticket or boarding pass and the original itinerary",
      "Cancellation or delay notice, including a screenshot with the time",
      "Any replacement itinerary offered and whether it is confirmed or waitlisted",
      "Agent name, contact time, and case number",
      "Receipts for necessary meals, lodging, and ground transportation"
    ];
  }
  if (playbook.situation === "planned_schedule_change") {
    return [
      "Original itinerary and ticket receipt",
      "Schedule-change notice and the replacement itinerary offered",
      "Specific alternative flights you want the agent to check",
      "Written confirmation and case number for any accepted change",
      "Proof that unaffected onward and return segments remain confirmed"
    ];
  }
  return analysis.evidenceChecklist;
}

export function buildActionPlan(
  facts: ClaimFacts,
  analysis: ActionPlanAnalysis,
  playbook: HandlingPlaybook = buildHandlingPlaybook(facts)
): ActionPlan {
  const references = [
    ...officialReferences(analysis),
    ...communityReferences(facts, analysis)
  ].slice(0, MAX_REFERENCES);
  const [primaryAsk = null, ...askNext] = playbook.askLadder;

  return {
    status: playbook.status,
    situation: playbook.situation,
    headline: headlineFor(playbook),
    contactNow: playbook.contactFirst,
    primaryAsk,
    askNext: askNext.slice(0, 3),
    evidenceNow: unique(evidenceForCurrentStage(facts, analysis, playbook)).slice(
      0,
      MAX_EVIDENCE_ITEMS
    ),
    ifTheySayNo: unique(playbook.fallback).slice(0, 3),
    uncertainties: unique([
      ...playbook.uncertainties,
      ...unresolvedPolicyConditions(analysis)
    ]).slice(0, MAX_UNCERTAINTIES),
    references,
    sourceIds: references
      .filter((reference) => reference.kind === "official")
      .map((reference) => reference.id),
    providerFeedbackPrompt:
      "Paste what the hotel or airline says next. I’ll identify what they answered and what to do after that.",
    notGuaranteed: true
  };
}
