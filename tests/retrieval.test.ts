import { describe, expect, it } from "vitest";

import casesJson from "../data/cases.json";
import policiesJson from "../data/policies.json";
import scriptsJson from "../data/scripts.json";
import { classifyInput } from "../lib/classifier";
import { MVP_ISSUE_TYPES } from "../lib/issueTaxonomy";
import { retrieveKnowledge } from "../lib/retrieval";
import { rankCases } from "../lib/retrievalScoring";
import { buildScenarioSummaries } from "../lib/scenarios";
import type { Case, IssueType, Policy, Script } from "../lib/types";

const cases = casesJson as Case[];
const policies = policiesJson as Policy[];
const scripts = scriptsJson as Script[];

type GoldenScenario = {
  name: string;
  description: string;
  expectedIssue: IssueType;
  expectedProvider?: string;
  expectedPolicyId: string;
  expectedTopCaseId: string;
};

const goldenScenarios: GoldenScenario[] = [
  {
    name: "Marriott hotel walk",
    description:
      "I booked directly and arrived as a Marriott Titanium member with a confirmed Sheraton reservation. The hotel front desk said it was oversold and had no room.",
    expectedIssue: "hotel_walk",
    expectedProvider: "Marriott",
    expectedPolicyId: "marriott_ultimate_reservation_guarantee",
    expectedTopCaseId: "marriott_walk_synthetic_001"
  },
  {
    name: "United controllable cancellation",
    description:
      "My United flight was cancelled because the crew timed out. I was rebooked the next morning and needed an overnight hotel.",
    expectedIssue: "controllable_airline_cancellation",
    expectedProvider: "United",
    expectedPolicyId: "dot_airline_cancellation_delay_dashboard",
    expectedTopCaseId: "united_crew_delay_synthetic_001"
  },
  {
    name: "American mechanical delay",
    description:
      "My American Airlines flight was delayed overnight because of a mechanical problem with the aircraft.",
    expectedIssue: "controllable_airline_delay",
    expectedProvider: "American Airlines",
    expectedPolicyId: "dot_airline_cancellation_delay_dashboard",
    expectedTopCaseId: "uscf_aa127_mechanical_delay_overnight_2026_07"
  },
  {
    name: "Delta voluntary bump",
    description:
      "My Delta flight is oversold and the gate agent is asking for volunteers to take a flight tomorrow. I have not volunteered yet.",
    expectedIssue: "denied_boarding",
    expectedProvider: "Delta",
    expectedPolicyId: "dot_bumping_oversales",
    expectedTopCaseId: "uscf_delta_voluntary_bump_2026_01"
  },
  {
    name: "EU261 Air France delay",
    description:
      "My Air France flight from the EU arrived four hours late after a technical issue. I want the airline to assess EU261 eligibility.",
    expectedIssue: "eu261_delay_or_cancellation",
    expectedProvider: "Air France",
    expectedPolicyId: "eu261_air_passenger_rights",
    expectedTopCaseId: "uscf_af_eu261_cancellation_2026_03"
  }
];

describe.each(goldenScenarios)("golden retrieval: $name", (scenario) => {
  it("classifies the issue and provider", () => {
    const facts = classifyInput(scenario.description);

    expect(facts.issueType).toBe(scenario.expectedIssue);
    expect(facts.provider).toBe(scenario.expectedProvider);
    expect(facts.confidence).toBe("high");
  });

  it("returns grounded, bounded, deterministic results", () => {
    const facts = classifyInput(scenario.description);
    const first = retrieveKnowledge(facts, policies, cases, scripts);
    const second = retrieveKnowledge(facts, policies, cases, scripts);

    expect(first.officialBasis.map((policy) => policy.policy_id)).toContain(
      scenario.expectedPolicyId
    );
    expect(first.similarCases[0]?.case_id).toBe(scenario.expectedTopCaseId);
    expect(first.officialBasis.length).toBeLessThanOrEqual(3);
    expect(first.similarCases.length).toBeLessThanOrEqual(3);
    expect(first.scripts.length).toBeGreaterThan(0);
    expect(first.scripts.length).toBeLessThanOrEqual(2);
    expect(first.similarCases.every((item) => item.review_status === "approved")).toBe(true);
    expect(first.similarCases.map((item) => item.case_id)).toEqual(
      second.similarCases.map((item) => item.case_id)
    );
  });
});

describe("classification safeguards", () => {
  it("does not treat a travel-document problem as oversales denied boarding", () => {
    const facts = classifyInput(
      "An AA passenger renewed EVUS after waiting at check-in, missed the baggage cutoff, and was rebooked without a financial loss."
    );

    expect(facts.issueType).toBe("unknown");
  });

  it("does not label a weather cancellation as controllable", () => {
    const facts = classifyInput(
      "My American Airlines flight was cancelled because of severe weather at the airport."
    );

    expect(facts.issueType).toBe("unknown");
    expect(facts.disruptionReason).toBe("weather");
  });

  it("keeps an unexplained cancellation in the clarification path", () => {
    const facts = classifyInput("United cancelled my flight and did not give me a reason.");

    expect(facts.issueType).toBe("unknown");
    expect(facts.confidence).toBe("low");
  });

  it("distinguishes voluntary and involuntary bumping", () => {
    const voluntary = classifyInput(
      "The Delta flight is oversold and the gate is asking for volunteers."
    );
    const involuntary = classifyInput(
      "The oversold flight involuntarily bumped me even though I did not volunteer."
    );

    expect(voluntary.deniedBoardingKind).toBe("voluntary");
    expect(involuntary.deniedBoardingKind).toBe("involuntary");
  });

  it("does not confuse a hotel walk with airline denied boarding", () => {
    const facts = classifyInput(
      "The Marriott hotel front desk said the property was oversold and had no room for my confirmed reservation."
    );

    expect(facts.issueType).toBe("hotel_walk");
  });

  it("extracts provider and loyalty metadata from a Chinese hotel description", () => {
    const facts = classifyInput(
      "我是万豪钛金会员，通过官网预订喜来登，到店后前台说酒店超售没有房间。"
    );

    expect(facts.issueType).toBe("hotel_walk");
    expect(facts.provider).toBe("Marriott");
    expect(facts.bookingChannel).toBe("direct");
    expect(facts.loyaltyStatus).toBe("Titanium");
  });

  it("recognizes a Chinese voluntary-bump description", () => {
    const facts = classifyInput(
      "达美航班超售，登机口正在征集自愿改签到第二天航班的乘客。"
    );

    expect(facts.issueType).toBe("denied_boarding");
    expect(facts.provider).toBe("Delta");
    expect(facts.deniedBoardingKind).toBe("voluntary");
  });
});

describe("retrieval quality controls", () => {
  it("explains why the provider-specific case ranks first", () => {
    const facts = classifyInput(
      "My American Airlines flight was delayed overnight by a mechanical problem."
    );
    const retrieval = retrieveKnowledge(facts, policies, cases, scripts);
    const ranking = rankCases(retrieval.query, cases);

    expect(ranking[0]?.item.case_id).toBe("uscf_aa127_mechanical_delay_overnight_2026_07");
    expect(ranking[0]?.reasons).toContain("exact_issue_match");
    expect(ranking[0]?.reasons).toContain("provider_exact_match");
    expect(ranking[0]?.reasons).toContain("disruption_reason_match");
  });

  it("does not resolve excluded cases by direct case id", () => {
    const facts = classifyInput("", {
      caseId: "uscf_aa128_denied_boarding_cbp_evus_2026_04"
    });
    const retrieval = retrieveKnowledge(facts, policies, cases, scripts);

    expect(retrieval.selectedCase).toBeUndefined();
    expect(retrieval.similarCases).toEqual([]);
  });

  it("publishes only the five MVP scenarios", () => {
    const summaries = buildScenarioSummaries(policies, cases, scripts);

    expect(summaries.map((summary) => summary.issueType).sort()).toEqual(
      [...MVP_ISSUE_TYPES].sort()
    );
  });
});
