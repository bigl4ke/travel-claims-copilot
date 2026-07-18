import { describe, expect, it } from "vitest";

import casesJson from "../data/cases.json";
import policiesJson from "../data/policies.json";
import scriptsJson from "../data/scripts.json";
import { buildAnalysisFromFacts } from "../lib/analyze";
import { classifyInput } from "../lib/classifier";
import {
  emptyClaimFacts,
  normalizeClaimFacts,
  type ClaimDisruptionReason,
  type ClaimLocation
} from "../lib/claimFacts";
import type { Case, IssueType, Policy, Script } from "../lib/types";
import { retrieveKnowledge } from "../lib/retrieval";

const cases = casesJson as Case[];
const policies = policiesJson as Policy[];
const scripts = scriptsJson as Script[];

function location(
  city: string,
  country: string,
  region: ClaimLocation["region"] = null
): ClaimLocation {
  return { city, airport: null, country, region };
}

function analyzeRoute({
  issueType = "airline_cancellation",
  provider,
  origin,
  destination,
  reason = "unknown"
}: {
  issueType?: Extract<IssueType, "airline_delay" | "airline_cancellation" | "denied_boarding">;
  provider: string;
  origin: ClaimLocation;
  destination: ClaimLocation;
  reason?: ClaimDisruptionReason;
}) {
  let disruptionType: "delay" | "cancellation" | "denied_boarding" = "cancellation";
  if (issueType === "airline_delay") {
    disruptionType = "delay";
  } else if (issueType === "denied_boarding") {
    disruptionType = "denied_boarding";
  }

  const facts = normalizeClaimFacts({
    ...emptyClaimFacts(),
    issueType,
    providerType: "airline",
    provider,
    operatingCarrier: provider,
    origin,
    destination,
    disruptionType,
    disruptionReason: reason,
    arrivalDelayMinutes: issueType === "airline_delay" ? 240 : null,
    deniedBoardingKind: issueType === "denied_boarding" ? "involuntary" : "unknown",
    confidence: "high"
  });

  return buildAnalysisFromFacts(facts, policies, cases, scripts);
}

describe("regional policy applicability", () => {
  it("extracts route direction for deterministic regional matching", () => {
    const facts = classifyInput(
      "My British Airways flight from New York to London was cancelled because of a mechanical issue."
    );
    const retrieval = retrieveKnowledge(facts, policies, cases, scripts);

    expect(retrieval.query.originRegion).toBe("US");
    expect(retrieval.query.destinationRegion).toBe("UK");
    expect(retrieval.query.operatingCarrierRegion).toBe("UK");
    expect(retrieval.officialBasis.map((policy) => policy.legal_regime)).toContain("UK261");
  });

  it("applies UK261 to a UK departure", () => {
    const result = analyzeRoute({
      provider: "British Airways",
      origin: location("London", "United Kingdom"),
      destination: location("New York", "United States"),
      reason: "mechanical"
    });

    expect(result.legalRegimes).toContain("UK261");
    expect(result.officialBasis.map((policy) => policy.policy_id)).toContain(
      "uk261_assimilated_regulation_261_2004"
    );
    expect(result.scripts.map((script) => script.script_id)).toContain("uk261_claim_email_en");
  });

  it("does not apply UK261 to an inbound flight on an unconfirmed non-UK/EU carrier", () => {
    const result = analyzeRoute({
      provider: "United",
      origin: location("New York", "United States"),
      destination: location("London", "United Kingdom"),
      reason: "mechanical"
    });

    expect(result.legalRegimes).not.toContain("UK261");
    expect(result.scripts.map((script) => script.script_id)).not.toContain("uk261_claim_email_en");
  });

  it("applies EU261 to an EU-carrier arrival but not a non-EU-carrier arrival", () => {
    const euCarrierResult = analyzeRoute({
      provider: "Air France",
      origin: location("New York", "United States"),
      destination: location("Paris", "France"),
      reason: "mechanical"
    });
    const nonEuCarrierResult = analyzeRoute({
      provider: "United",
      origin: location("New York", "United States"),
      destination: location("Paris", "France"),
      reason: "mechanical"
    });

    expect(euCarrierResult.legalRegimes).toContain("EU261");
    expect(nonEuCarrierResult.legalRegimes).not.toContain("EU261");
  });

  it("retrieves Canadian APPR for a flight departing Canada", () => {
    const result = analyzeRoute({
      issueType: "airline_delay",
      provider: "Air Canada",
      origin: location("Toronto", "Canada"),
      destination: location("New York", "United States"),
      reason: "crew"
    });

    expect(result.policyRegions).toEqual(["CA", "US"]);
    expect(result.legalRegimes).toContain("CA_APPR");
    expect(result.suggestedAsks.standard).toContain(
      "Rebooking or refund under the applicable APPR conditions"
    );
  });

  it("retrieves Australian consumer guarantees without inventing fixed compensation", () => {
    const result = analyzeRoute({
      issueType: "airline_delay",
      provider: "Qantas",
      origin: location("Sydney", "Australia"),
      destination: location("Melbourne", "Australia"),
      reason: "mechanical"
    });

    expect(result.legalRegimes).toEqual(["AU_ACL"]);
    expect(result.cautions.join(" ")).toContain(
      "does not create an EU-style fixed compensation table"
    );
  });

  it("retrieves both Chinese passenger-service regulations for a mainland departure", () => {
    const result = analyzeRoute({
      provider: "China Eastern Airlines",
      origin: location("Shanghai", "China"),
      destination: location("Tokyo", "Japan", "other"),
      reason: "crew"
    });
    const policyIds = result.officialBasis.map((policy) => policy.policy_id);

    expect(result.legalRegimes).toEqual(["CN_FLIGHT_REGULATION"]);
    expect(policyIds).toContain("cn_flight_normality_regulation_2016");
    expect(policyIds).toContain("cn_public_air_transport_passenger_service_2021");
    expect(result.scripts.map((script) => script.script_id)).toContain(
      "cn_flight_disruption_request_zh"
    );
  });

  it("does not apply the China rules solely because a foreign carrier arrives in China", () => {
    const result = analyzeRoute({
      provider: "United",
      origin: location("Los Angeles", "United States"),
      destination: location("Shanghai", "China"),
      reason: "weather"
    });

    expect(result.legalRegimes).toContain("US_DOT_REFUND");
    expect(result.legalRegimes).not.toContain("CN_FLIGHT_REGULATION");
  });
});
