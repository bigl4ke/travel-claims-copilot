import type { ClaimFacts, ClaimLocation } from "./claimFacts";
import {
  inferRouteLocationsValue,
  isChineseCarrierValue,
  isEuCarrierValue,
  isUkOrEuCarrierValue,
  resolveKnownLocation,
  resolveOperatingCarrierRegion
} from "./domain/context-resolver";

export function isEuOperatingCarrier(carrier: string | null | undefined): boolean {
  return isEuCarrierValue(carrier);
}

export function isUkOrEuOperatingCarrier(carrier: string | null | undefined): boolean {
  return isUkOrEuCarrierValue(carrier);
}

export function isChineseOperatingCarrier(carrier: string | null | undefined): boolean {
  return isChineseCarrierValue(carrier);
}

function toClaimLocation(location: ReturnType<typeof resolveKnownLocation>): ClaimLocation {
  return {
    city: location.city,
    airport: location.airport,
    country: location.country,
    region: location.region
  };
}

export function inferRouteLocations(text: string): {
  origin?: ClaimLocation;
  destination?: ClaimLocation;
} {
  const locations = inferRouteLocationsValue(text);
  return {
    origin: locations.origin ? toClaimLocation(resolveKnownLocation(locations.origin)) : undefined,
    destination: locations.destination
      ? toClaimLocation(resolveKnownLocation(locations.destination))
      : undefined
  };
}

export function enrichClaimLocation(location: ClaimLocation): ClaimLocation {
  return toClaimLocation(
    resolveKnownLocation({
      city: location.city,
      airport: location.airport,
      country: location.country
    })
  );
}

export function enrichClaimJurisdiction(facts: ClaimFacts): ClaimFacts {
  return {
    ...facts,
    origin: enrichClaimLocation(facts.origin),
    destination: enrichClaimLocation(facts.destination)
  };
}

export type Eu261CandidateAssessment = {
  isCandidate: boolean;
  needsOperatingCarrierCheck: boolean;
  reasons: string[];
};

export function assessEu261Candidate(facts: ClaimFacts): Eu261CandidateAssessment {
  const enriched = enrichClaimJurisdiction(facts);
  if (enriched.origin.region === "EU_EEA_CH") {
    return {
      isCandidate: true,
      needsOperatingCarrierCheck: false,
      reasons: ["departure_region_eu_eea_ch"]
    };
  }
  if (enriched.destination.region !== "EU_EEA_CH") {
    return { isCandidate: false, needsOperatingCarrierCheck: false, reasons: [] };
  }
  const carrierRegion = resolveOperatingCarrierRegion(enriched.operatingCarrier).value;
  if (carrierRegion === "EU_EEA_CH") {
    return {
      isCandidate: true,
      needsOperatingCarrierCheck: false,
      reasons: ["arrival_region_eu_eea_ch", "eu_operating_carrier"]
    };
  }
  return {
    isCandidate: false,
    needsOperatingCarrierCheck: carrierRegion === null,
    reasons: [
      "arrival_region_eu_eea_ch",
      carrierRegion === null ? "operating_carrier_unconfirmed" : "operating_carrier_excluded"
    ]
  };
}

export type Uk261CandidateAssessment = {
  isCandidate: boolean;
  needsOperatingCarrierCheck: boolean;
  reasons: string[];
};

export function assessUk261Candidate(facts: ClaimFacts): Uk261CandidateAssessment {
  const enriched = enrichClaimJurisdiction(facts);
  if (enriched.origin.region === "UK") {
    return {
      isCandidate: true,
      needsOperatingCarrierCheck: false,
      reasons: ["departure_region_uk"]
    };
  }
  if (enriched.destination.region !== "UK") {
    return { isCandidate: false, needsOperatingCarrierCheck: false, reasons: [] };
  }
  const carrierRegion = resolveOperatingCarrierRegion(enriched.operatingCarrier).value;
  if (carrierRegion === "UK" || carrierRegion === "EU_EEA_CH") {
    return {
      isCandidate: true,
      needsOperatingCarrierCheck: false,
      reasons: ["arrival_region_uk", "uk_or_eu_operating_carrier"]
    };
  }
  return {
    isCandidate: false,
    needsOperatingCarrierCheck: carrierRegion === null,
    reasons: [
      "arrival_region_uk",
      carrierRegion === null ? "operating_carrier_unconfirmed" : "operating_carrier_excluded"
    ]
  };
}
