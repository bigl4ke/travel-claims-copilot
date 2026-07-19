import { describe, expect, it } from "vitest";

import carrierCommitmentsJson from "../../data/carrier-commitments.json";
import {
  evaluateCarrierCommitment,
  evaluateCarrierCommitmentPredicate,
  evaluateCarrierCommitmentPredicates,
  type CarrierCommitment,
  type CarrierCommitmentPredicate,
  type CarrierPredicateFacts
} from "../../lib/knowledge/knowledge-contract";

const eventPredicate: CarrierCommitmentPredicate = {
  kind: "event",
  field: "incidentType",
  operator: "one_of",
  values: ["airline_delay", "airline_cancellation"]
};
const controllabilityPredicate: CarrierCommitmentPredicate = {
  kind: "controllability",
  field: "controllability",
  operator: "equals",
  value: "controllable"
};
const waitPredicate: CarrierCommitmentPredicate = {
  kind: "minimum_wait_minutes",
  field: "waitMinutes",
  operator: "at_least",
  value: 180
};
const overnightPredicate: CarrierCommitmentPredicate = {
  kind: "overnight",
  field: "isOvernight",
  operator: "equals",
  value: true
};

function commitmentFixture(overrides: Partial<CarrierCommitment> = {}): CarrierCommitment {
  return {
    commitmentId: "united_test_commitment",
    normalizedCarrier: "United",
    applicableCarrierRole: "operating_carrier",
    sourceTitle: "Test carrier commitment",
    sourceProvider: "Test regulator",
    sourceUrl: "https://example.test/united",
    sourceType: "official_dashboard",
    legalRegime: "US_AIRLINE_COMMITMENT",
    authority: "medium",
    lastChecked: "2026-07-18",
    reviewerNote: "Test fixture only.",
    remedies: [
      {
        remedyId: "us_hotel",
        committed: true,
        predicates: [eventPredicate, controllabilityPredicate, overnightPredicate],
        displayConditions: ["Test condition"],
        rights: ["Test right"]
      }
    ],
    ...overrides
  };
}

describe("reviewed production carrier commitments", () => {
  it("records the conservative United mapping from the carrier-filtered DOT view", () => {
    expect(carrierCommitmentsJson).toEqual([
      expect.objectContaining({
        commitment_id: "united_dot_controllable_disruption_commitments_2026_07_19",
        normalized_carrier: "United",
        applicable_carrier_role: "operating_carrier",
        source_title: "Airline Cancellation and Delay Dashboard",
        source_provider: "U.S. Department of Transportation",
        source_url:
          "https://www.transportation.gov/airconsumer/airline-cancellation-delay-dashboard?carrier_target_id=29861",
        source_type: "official_dashboard",
        legal_regime: "US_AIRLINE_COMMITMENT",
        authority: "medium",
        last_checked: "2026-07-19",
        remedies: [
          expect.objectContaining({
            remedy_id: "us_rerouting",
            committed: true,
            predicates: expect.arrayContaining([
              expect.objectContaining({
                kind: "event",
                field: "incidentType",
                operator: "one_of",
                values: ["airline_cancellation"]
              }),
              expect.objectContaining({ kind: "controllability", value: "controllable" })
            ])
          }),
          expect.objectContaining({
            remedy_id: "us_meal",
            committed: true,
            predicates: expect.arrayContaining([
              expect.objectContaining({
                kind: "minimum_wait_minutes",
                field: "waitMinutes",
                operator: "at_least",
                value: 180
              })
            ])
          }),
          expect.objectContaining({ remedy_id: "us_hotel", committed: true }),
          expect.objectContaining({ remedy_id: "us_ground_transport", committed: true })
        ]
      })
    ]);
  });
});

describe("carrier commitment predicate evaluation", () => {
  it.each([
    ["event", eventPredicate, { incidentType: "airline_delay" }, "matched"],
    ["event exclusion", eventPredicate, { incidentType: "hotel_walk" }, "excluded"],
    ["controllability", controllabilityPredicate, { controllability: "controllable" }, "matched"],
    [
      "controllability exclusion",
      controllabilityPredicate,
      { controllability: "uncontrollable" },
      "excluded"
    ],
    ["overnight", overnightPredicate, { isOvernight: true }, "matched"],
    ["overnight exclusion", overnightPredicate, { isOvernight: false }, "excluded"]
  ] as const)(
    "returns the expected tri-state result for %s",
    (_name, predicate, facts, expected) => {
      expect(evaluateCarrierCommitmentPredicate(predicate, facts)).toBe(expected);
    }
  );

  it.each([
    ["event", eventPredicate, {}],
    ["event null", eventPredicate, { incidentType: null }],
    ["controllability", controllabilityPredicate, { controllability: "unknown" }],
    ["controllability null", controllabilityPredicate, { controllability: null }],
    ["overnight", overnightPredicate, {}],
    ["overnight null", overnightPredicate, { isOvernight: null }],
    ["wait", waitPredicate, {}],
    [
      "wait does not substitute final-arrival delay",
      waitPredicate,
      { finalArrivalDelayMinutes: 600 }
    ]
  ] as const)("keeps absent or non-computable %s facts missing", (_name, predicate, facts) => {
    expect(evaluateCarrierCommitmentPredicate(predicate, facts)).toBe("missing");
    expect(evaluateCarrierCommitmentPredicates([predicate], facts)).toBe("conditional");
    expect(evaluateCarrierCommitmentPredicates([predicate], facts)).not.toBe("supported");
  });

  it("requires every predicate to match for supported", () => {
    const facts: CarrierPredicateFacts = {
      incidentType: "airline_cancellation",
      controllability: "controllable",
      isOvernight: true
    };

    expect(
      evaluateCarrierCommitmentPredicates(
        [eventPredicate, controllabilityPredicate, overnightPredicate],
        facts
      )
    ).toBe("supported");
  });

  it("makes any excluded predicate unavailable", () => {
    expect(
      evaluateCarrierCommitmentPredicates([eventPredicate, controllabilityPredicate], {
        incidentType: "airline_delay",
        controllability: "uncontrollable"
      })
    ).toBe("unavailable");
  });

  it("never treats an empty predicate set as supported", () => {
    expect(evaluateCarrierCommitmentPredicates([], {})).toBe("conditional");
  });
});

describe("complete carrier commitment evaluation", () => {
  const matchingInput = {
    normalizedCarrier: "United",
    carrierRole: "operating_carrier",
    facts: {
      incidentType: "airline_cancellation" as const,
      controllability: "controllable" as const,
      isOvernight: true
    },
    asOf: "2026-07-19"
  };

  it("exposes one complete evaluator as the supported-status boundary", () => {
    expect(evaluateCarrierCommitment(commitmentFixture(), "us_hotel", matchingInput)).toBe(
      "supported"
    );
  });

  it("fails closed for uncommitted, absent, and predicate-free remedies", () => {
    const uncommitted = commitmentFixture({
      remedies: [
        {
          ...commitmentFixture().remedies[0],
          committed: false,
          predicates: []
        }
      ]
    });
    const predicateFree = commitmentFixture({
      remedies: [{ ...commitmentFixture().remedies[0], predicates: [] }]
    });

    expect(evaluateCarrierCommitment(uncommitted, "us_hotel", matchingInput)).toBe("unavailable");
    expect(evaluateCarrierCommitment(commitmentFixture(), "us_meal", matchingInput)).toBe(
      "unavailable"
    );
    expect(evaluateCarrierCommitment(predicateFree, "us_hotel", matchingInput)).toBe("conditional");
  });

  it("requires an exact carrier and operating-carrier role", () => {
    expect(
      evaluateCarrierCommitment(commitmentFixture(), "us_hotel", {
        ...matchingInput,
        normalizedCarrier: "Delta"
      })
    ).toBe("unavailable");
    expect(
      evaluateCarrierCommitment(commitmentFixture(), "us_hotel", {
        ...matchingInput,
        normalizedCarrier: null
      })
    ).toBe("conditional");
    expect(
      evaluateCarrierCommitment(commitmentFixture(), "us_hotel", {
        ...matchingInput,
        carrierRole: "ticketing_carrier"
      })
    ).toBe("unavailable");
    expect(
      evaluateCarrierCommitment(commitmentFixture(), "us_hotel", {
        ...matchingInput,
        carrierRole: null
      })
    ).toBe("conditional");
  });

  it("keeps stale records conditional and accepts the exact 30-day boundary", () => {
    const commitment = commitmentFixture({ lastChecked: "2026-06-19" });
    expect(
      evaluateCarrierCommitment(commitment, "us_hotel", {
        ...matchingInput,
        asOf: "2026-07-19"
      })
    ).toBe("supported");
    expect(
      evaluateCarrierCommitment(commitment, "us_hotel", {
        ...matchingInput,
        asOf: "2026-07-20"
      })
    ).toBe("conditional");
  });
});
