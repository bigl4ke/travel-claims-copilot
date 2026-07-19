/* eslint-disable no-param-reassign */

type JsonObject = Record<string, unknown>;

export type MutableKnowledgeSnapshot = {
  policies: JsonObject[];
  cases: JsonObject[];
  scripts: JsonObject[];
  carrierCommitments: JsonObject[];
};

const eventPredicate = (): JsonObject => ({
  kind: "event",
  field: "incidentType",
  operator: "one_of",
  values: ["airline_delay", "airline_cancellation"]
});

const controllabilityPredicate = (): JsonObject => ({
  kind: "controllability",
  field: "controllability",
  operator: "equals",
  value: "controllable"
});

export function verifiedUnitedCommitmentFixture(): JsonObject {
  return {
    commitment_id: "united_verified_fixture",
    normalized_carrier: "United",
    applicable_carrier_role: "operating_carrier",
    source_title: "Synthetic verified carrier-commitment fixture",
    source_provider: "Test fixture only",
    source_url: "https://example.test/united-commitment-fixture",
    source_type: "official_dashboard",
    legal_regime: "US_AIRLINE_COMMITMENT",
    authority: "medium",
    last_checked: "2026-07-18",
    reviewer_note: "Fixture provenance only; not a reviewed production United record.",
    remedies: [
      {
        remedy_id: "us_hotel",
        committed: true,
        predicates: [
          eventPredicate(),
          controllabilityPredicate(),
          {
            kind: "overnight",
            field: "isOvernight",
            operator: "equals",
            value: true
          }
        ],
        display_conditions: ["Fixture condition"],
        rights: ["Fixture right"]
      }
    ]
  };
}

export function validKnowledgeFixture(): MutableKnowledgeSnapshot {
  return {
    policies: [
      {
        policy_id: "policy_primary",
        provider_type: "government",
        provider: "Test Regulator",
        policy_name: "Primary test policy",
        legal_regime: "US_DOT_REFUND",
        applicability_rule: "any_route",
        incident_types: ["airline_delay"],
        applicable_regions: ["US"],
        applicable_providers: [],
        required_controllability: "any",
        source_url: "https://example.test/policy-primary",
        source_type: "government_regulation",
        authority_level: "high",
        applicable_conditions: ["Test condition"],
        compensation_or_rights: ["Test right"],
        summary: "Test-only official policy fixture.",
        last_checked: "2026-07-18"
      },
      {
        policy_id: "policy_outside_display_top_k",
        provider_type: "government",
        provider: "Test Regulator",
        policy_name: "Citation promotion test policy",
        legal_regime: "US_DOT_REFUND",
        applicability_rule: "any_route",
        incident_types: ["airline_delay"],
        applicable_regions: ["US"],
        applicable_providers: [],
        required_controllability: "any",
        source_url: "https://example.test/policy-citation-promotion",
        source_type: "government_regulation",
        authority_level: "high",
        applicable_conditions: ["Test condition"],
        compensation_or_rights: ["Test right"],
        summary: "Test-only policy intentionally cited outside a future display Top-K.",
        last_checked: "2026-07-18"
      }
    ],
    cases: [
      {
        case_id: "case_primary",
        source_type: "community_dp",
        source_name: "Test community report",
        source_url: "https://example.test/community-case",
        provider_type: "airline",
        provider: "United",
        brand_or_airline: "United",
        issue_type: "airline_delay",
        location_country: "US",
        booking_channel: "direct",
        loyalty_status: "unknown",
        reservation_type: "paid",
        facts: "Synthetic identifiers are not used in this community fixture.",
        requested_compensation: ["Test request"],
        actual_outcome: "Test outcome",
        evidence_used: ["Test evidence"],
        escalation_path: ["Test escalation"],
        reusable_lesson: "Test lesson",
        confidence: "medium",
        notes: "Fixture representing a community record.",
        review_status: "approved",
        review_notes: []
      }
    ],
    scripts: [
      {
        script_id: "script_primary",
        source_ids: ["policy_primary", "policy_outside_display_top_k"],
        incident_types: ["airline_delay"],
        applicable_regions: ["US"],
        applicability_rule: "any_route",
        required_controllability: "any",
        provider: "generic_airline",
        channel: "email",
        tone: "polite_firm",
        language: "en",
        template: "Test template",
        when_to_use: "Test use only"
      }
    ],
    carrierCommitments: [verifiedUnitedCommitmentFixture()]
  };
}

function invalidFixture(
  name: string,
  expected: RegExp,
  mutate: (snapshot: MutableKnowledgeSnapshot) => void
): { name: string; expected: RegExp; snapshot: MutableKnowledgeSnapshot } {
  const snapshot = validKnowledgeFixture();
  mutate(snapshot);
  return { name, expected, snapshot };
}

function firstRemedy(snapshot: MutableKnowledgeSnapshot): JsonObject {
  const remedies = snapshot.carrierCommitments[0].remedies as JsonObject[];
  return remedies[0];
}

export const invalidKnowledgeFixtures = [
  invalidFixture("missing required field", /missing required field/i, (snapshot) => {
    delete snapshot.policies[0].summary;
  }),
  invalidFixture("duplicate IDs", /duplicate.*policy_id/i, (snapshot) => {
    snapshot.policies.push({ ...snapshot.policies[0] });
  }),
  invalidFixture("invalid enum", /provider_type.*invalid/i, (snapshot) => {
    snapshot.policies[0].provider_type = "spaceship";
  }),
  invalidFixture("invalid array", /incident_types.*array/i, (snapshot) => {
    snapshot.policies[0].incident_types = "airline_delay";
  }),
  invalidFixture("non-HTTPS URL", /HTTPS/i, (snapshot) => {
    snapshot.policies[0].source_url = "http://example.test/policy";
  }),
  invalidFixture("malformed date", /date/i, (snapshot) => {
    snapshot.policies[0].last_checked = "2026-02-30";
  }),
  invalidFixture("future date", /future/i, (snapshot) => {
    snapshot.policies[0].last_checked = "2026-07-20";
  }),
  invalidFixture("stale medium-authority critical source", /stale/i, (snapshot) => {
    snapshot.policies[0].authority_level = "medium";
    snapshot.policies[0].last_checked = "2026-06-17";
  }),
  invalidFixture("unapproved case without notes", /not approved/i, (snapshot) => {
    snapshot.cases[0].review_status = "needs_review";
    snapshot.cases[0].review_notes = [];
  }),
  invalidFixture("approved unknown incident", /unknown issue/i, (snapshot) => {
    snapshot.cases[0].issue_type = "unknown";
  }),
  invalidFixture("legacy legal label used as case incident", /legal regime/i, (snapshot) => {
    snapshot.cases[0].issue_type = "eu261_delay_or_cancellation";
    snapshot.cases[0].review_status = "needs_review";
    snapshot.cases[0].review_notes = ["Pending review"];
  }),
  invalidFixture("duplicate community URL", /duplicate.*community/i, (snapshot) => {
    snapshot.cases.push({ ...snapshot.cases[0], case_id: "case_duplicate_url" });
  }),
  invalidFixture("unlabeled synthetic case", /synthetic.*label/i, (snapshot) => {
    snapshot.cases[0] = {
      ...snapshot.cases[0],
      source_type: "synthetic_example",
      source_name: "Example report",
      source_url: "",
      facts: "Example facts",
      notes: "Demo only",
      review_notes: []
    };
  }),
  invalidFixture("synthetic case masquerading as real", /masquerad/i, (snapshot) => {
    snapshot.cases[0].source_name = "Synthetic demo case";
  }),
  invalidFixture("synthetic marker hidden in real-case notes", /masquerad/i, (snapshot) => {
    snapshot.cases[0].notes = "Synthetic demo case presented as a community report";
  }),
  invalidFixture("synthetic marker hidden in real-case facts", /masquerad/i, (snapshot) => {
    snapshot.cases[0].facts = "Synthetic demo case presented as a community report";
  }),
  invalidFixture("synthetic data hidden in real-case facts", /masquerad/i, (snapshot) => {
    snapshot.cases[0].facts = "This is synthetic data generated for testing";
  }),
  invalidFixture("synthetic scenario hidden in real-case facts", /masquerad/i, (snapshot) => {
    snapshot.cases[0].facts = "A synthetic scenario generated for testing";
  }),
  invalidFixture("synthetic marker followed by not-real claim", /masquerad/i, (snapshot) => {
    snapshot.cases[0].facts = "This is a synthetic test case, not a real report.";
  }),
  invalidFixture("unrelated no before synthetic marker", /masquerad/i, (snapshot) => {
    snapshot.cases[0].facts = "No compensation was offered; this is a synthetic test case.";
  }),
  invalidFixture("synthetic marker followed by without-real claim", /masquerad/i, (snapshot) => {
    snapshot.cases[0].facts =
      "This synthetic scenario was generated for testing, without real passenger facts.";
  }),
  invalidFixture("bare synthetic marker in real-case facts", /masquerad/i, (snapshot) => {
    snapshot.cases[0].facts = "This community report is entirely synthetic.";
  }),
  invalidFixture("bare fabricated marker in real-case facts", /masquerad/i, (snapshot) => {
    snapshot.cases[0].facts = "This is a fabricated account.";
  }),
  invalidFixture("positive synthetic marker before direct negation", /masquerad/i, (snapshot) => {
    snapshot.cases[0].facts = "This is a synthetic test case, not a synthetic report.";
  }),
  invalidFixture("positive synthetic marker after direct negation", /masquerad/i, (snapshot) => {
    snapshot.cases[0].facts = "Not a synthetic report; this is a synthetic test case.";
  }),
  invalidFixture("positive synthetic marker plus never phrase", /masquerad/i, (snapshot) => {
    snapshot.cases[0].facts =
      "Synthetic data generated for testing, but never a synthetic fixture.";
  }),
  invalidFixture("umbrella dashboard remedies", /regulator context only/i, (snapshot) => {
    snapshot.policies[0] = {
      ...snapshot.policies[0],
      policy_id: "dot_airline_cancellation_delay_dashboard",
      legal_regime: "US_AIRLINE_COMMITMENT",
      source_type: "official_dashboard",
      applicable_providers: ["United"],
      compensation_or_rights: ["Hotel accommodation"]
    };
  }),
  invalidFixture("renamed umbrella carrier remedies", /regulator context only/i, (snapshot) => {
    snapshot.policies[0] = {
      ...snapshot.policies[0],
      policy_id: "renamed_airline_commitment_context",
      legal_regime: "US_AIRLINE_COMMITMENT",
      source_type: "official_dashboard",
      compensation_or_rights: ["Meal voucher"]
    };
    snapshot.scripts[0].source_ids = [
      "renamed_airline_commitment_context",
      "policy_outside_display_top_k"
    ];
  }),
  invalidFixture(
    "renamed umbrella carrier-care synonyms",
    /regulator context only/i,
    (snapshot) => {
      snapshot.policies[0] = {
        ...snapshot.policies[0],
        policy_id: "renamed_airline_commitment_synonym_context",
        legal_regime: "US_AIRLINE_COMMITMENT",
        source_type: "official_dashboard",
        compensation_or_rights: ["Complimentary lodging and airport transfer"]
      };
      snapshot.scripts[0].source_ids = [
        "renamed_airline_commitment_synonym_context",
        "policy_outside_display_top_k"
      ];
    }
  ),
  invalidFixture("unknown carrier", /unknown canonical carrier/i, (snapshot) => {
    snapshot.carrierCommitments[0].normalized_carrier = "Example Air";
  }),
  invalidFixture("carrier alias", /canonical carrier name/i, (snapshot) => {
    snapshot.carrierCommitments[0].normalized_carrier = "United Airlines";
  }),
  invalidFixture("wrong carrier role", /operating_carrier/i, (snapshot) => {
    snapshot.carrierCommitments[0].applicable_carrier_role = "ticketing_carrier";
  }),
  invalidFixture("missing source title", /source_title/i, (snapshot) => {
    delete snapshot.carrierCommitments[0].source_title;
  }),
  invalidFixture("missing source provider", /source_provider/i, (snapshot) => {
    delete snapshot.carrierCommitments[0].source_provider;
  }),
  invalidFixture("wrong legal regime", /legal_regime/i, (snapshot) => {
    snapshot.carrierCommitments[0].legal_regime = "US_DOT_REFUND";
  }),
  invalidFixture("wrong authority", /authority/i, (snapshot) => {
    snapshot.carrierCommitments[0].authority = "high";
  }),
  invalidFixture("invalid commitment remedy", /remedy_id/i, (snapshot) => {
    firstRemedy(snapshot).remedy_id = "free_vacation";
  }),
  invalidFixture("free-form eligibility", /predicates/i, (snapshot) => {
    const remedy = firstRemedy(snapshot);
    delete remedy.predicates;
    remedy.eligibility = "delay is controllable";
  }),
  invalidFixture("unknown predicate field", /predicate.*field/i, (snapshot) => {
    const predicates = firstRemedy(snapshot).predicates as JsonObject[];
    predicates[0].field = "issueType";
  }),
  invalidFixture("unknown predicate operator", /predicate.*operator/i, (snapshot) => {
    const predicates = firstRemedy(snapshot).predicates as JsonObject[];
    predicates[0].operator = "contains";
  }),
  invalidFixture("non-positive wait threshold", /positive integer/i, (snapshot) => {
    const predicates = firstRemedy(snapshot).predicates as JsonObject[];
    predicates.push({
      kind: "minimum_wait_minutes",
      field: "waitMinutes",
      operator: "at_least",
      value: 0
    });
  }),
  invalidFixture("non-integer wait threshold", /positive integer/i, (snapshot) => {
    const predicates = firstRemedy(snapshot).predicates as JsonObject[];
    predicates.push({
      kind: "minimum_wait_minutes",
      field: "waitMinutes",
      operator: "at_least",
      value: 90.5
    });
  }),
  invalidFixture("committed remedy missing event", /event.*controllability/i, (snapshot) => {
    firstRemedy(snapshot).predicates = [controllabilityPredicate()];
  }),
  invalidFixture(
    "committed remedy missing controllability",
    /event.*controllability/i,
    (snapshot) => {
      firstRemedy(snapshot).predicates = [eventPredicate()];
    }
  ),
  invalidFixture("missing script source IDs", /source_ids/i, (snapshot) => {
    delete snapshot.scripts[0].source_ids;
  }),
  invalidFixture("empty script source IDs", /1\.\.8/i, (snapshot) => {
    snapshot.scripts[0].source_ids = [];
  }),
  invalidFixture("too many script source IDs", /1\.\.8/i, (snapshot) => {
    snapshot.scripts[0].source_ids = Array.from({ length: 9 }, (_, index) => `policy_${index}`);
  }),
  invalidFixture("duplicate script source IDs", /duplicate.*source_ids/i, (snapshot) => {
    snapshot.scripts[0].source_ids = ["policy_primary", "policy_primary"];
  }),
  invalidFixture("unknown script source ID", /unknown policy/i, (snapshot) => {
    snapshot.scripts[0].source_ids = ["missing_policy"];
  }),
  invalidFixture("case ID used as policy source", /case namespace/i, (snapshot) => {
    snapshot.scripts[0].source_ids = ["case_primary"];
  }),
  invalidFixture("commitment ID used as policy source", /commitment namespace/i, (snapshot) => {
    snapshot.scripts[0].source_ids = ["united_verified_fixture"];
  }),
  invalidFixture("script ID used as policy source", /script namespace/i, (snapshot) => {
    snapshot.scripts[0].source_ids = ["script_primary"];
  }),
  invalidFixture("identifier namespace collision", /namespace collision/i, (snapshot) => {
    snapshot.cases[0].case_id = "policy_primary";
  })
];
