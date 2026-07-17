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
    expectedIssue: "airline_cancellation",
    expectedProvider: "United",
    expectedPolicyId: "dot_airline_cancellation_delay_dashboard",
    expectedTopCaseId: "united_crew_delay_synthetic_001"
  },
  {
    name: "American mechanical delay",
    description:
      "My American Airlines flight was delayed overnight because of a mechanical problem with the aircraft.",
    expectedIssue: "airline_delay",
    expectedProvider: "American Airlines",
    expectedPolicyId: "dot_airline_cancellation_delay_dashboard",
    expectedTopCaseId: "uscf_aa127_mechanical_delay_overnight_2026_07"
  },
  {
    name: "Delta voluntary bump",
    description:
      "My Delta flight departing from a United States airport is oversold and the gate agent is asking for volunteers to take a flight tomorrow. I have not volunteered yet.",
    expectedIssue: "denied_boarding",
    expectedProvider: "Delta",
    expectedPolicyId: "dot_bumping_oversales",
    expectedTopCaseId: "uscf_delta_voluntary_bump_2026_01"
  },
  {
    name: "EU-region Air France delay",
    description:
      "My Air France flight from the EU arrived four hours late after a technical issue. I want the airline to assess EU261 eligibility.",
    expectedIssue: "airline_delay",
    expectedProvider: "Air France",
    expectedPolicyId: "eu261_air_passenger_rights",
    expectedTopCaseId: "uscf_lh_eu261_claim_2022_05"
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

  it("keeps weather separate from the cancellation incident type", () => {
    const facts = classifyInput(
      "My American Airlines flight was cancelled because of severe weather at the airport."
    );

    expect(facts.issueType).toBe("airline_cancellation");
    expect(facts.disruptionReason).toBe("weather");
  });

  it("classifies an unexplained cancellation while keeping its reason unknown", () => {
    const facts = classifyInput("United cancelled my flight and did not give me a reason.");

    expect(facts.issueType).toBe("airline_cancellation");
    expect(facts.confidence).toBe("medium");
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
  it("matches a Chinese Marriott alias to Marriott policy and cases only", () => {
    const facts = {
      ...classifyInput("我订了万豪酒店，但是到店无房。"),
      provider: "万豪酒店"
    };
    const retrieval = retrieveKnowledge(facts, policies, cases, scripts);

    expect(retrieval.officialBasis.map((policy) => policy.policy_id)).toContain(
      "marriott_ultimate_reservation_guarantee"
    );
    expect(retrieval.similarCases.map((item) => item.case_id)).toEqual([
      "marriott_walk_synthetic_001"
    ]);
    expect(retrieval.similarCases.every((item) => item.provider === "Marriott")).toBe(
      true
    );
  });

  it("selects official policies by incident, jurisdiction, provider, and controllability", () => {
    const euCancellation = retrieveKnowledge(
      classifyInput(
        "My Air France flight from Paris was cancelled because of a mechanical issue."
      ),
      policies,
      cases,
      scripts
    );
    const usControllableCancellation = retrieveKnowledge(
      classifyInput("United cancelled my flight because the crew timed out."),
      policies,
      cases,
      scripts
    );
    const usWeatherCancellation = retrieveKnowledge(
      classifyInput("United cancelled my flight because of severe weather."),
      policies,
      cases,
      scripts
    );

    expect(euCancellation.query.policyRegions).toEqual(["EU_EEA_CH"]);
    expect(euCancellation.officialBasis.map((policy) => policy.policy_id)).toEqual([
      "eu261_air_passenger_rights",
      "eu261_regulation_261_2004"
    ]);
    expect(euCancellation.scripts[0]?.script_id).toBe("eu261_claim_email_en");
    expect(
      euCancellation.scripts.some((script) =>
        script.applicable_regions.includes("EU_EEA_CH")
      )
    ).toBe(true);
    expect(
      usControllableCancellation.officialBasis.map((policy) => policy.policy_id)
    ).toContain("dot_airline_cancellation_delay_dashboard");
    expect(
      usControllableCancellation.scripts.every((script) =>
        script.applicable_regions.includes("global")
      )
    ).toBe(true);
    expect(usWeatherCancellation.officialBasis).toEqual([]);
  });

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

  it("publishes only the four incident-based MVP scenarios", () => {
    const summaries = buildScenarioSummaries(policies, cases, scripts);

    expect(summaries.map((summary) => summary.issueType).sort()).toEqual(
      [...MVP_ISSUE_TYPES].sort()
    );
  });
});
