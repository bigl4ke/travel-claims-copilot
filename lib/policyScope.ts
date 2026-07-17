import type { ClaimDisruptionReason } from "./claimFacts";
import {
  isChineseOperatingCarrier,
  isEuOperatingCarrier,
  isUkOrEuOperatingCarrier
} from "./jurisdiction";
import type {
  Controllability,
  Policy,
  PolicyApplicabilityRule,
  PolicyRegion,
  PolicyRouteRegion,
  RetrievalQuery
} from "./types";

const euCountries = new Set([
  "eu",
  "france",
  "germany",
  "italy",
  "spain",
  "netherlands",
  "ireland",
  "portugal",
  "belgium",
  "austria",
  "greece",
  "sweden",
  "denmark",
  "finland",
  "poland",
  "czechia",
  "norway",
  "iceland",
  "switzerland"
]);

export function controllabilityFromReason(
  reason: ClaimDisruptionReason | undefined
): Controllability {
  if (reason === "crew" || reason === "mechanical" || reason === "other_controllable") {
    return "controllable";
  }
  if (reason === "weather") {
    return "uncontrollable";
  }
  return "unknown";
}

export function policyRegionsFromCountry(country: string | undefined): PolicyRegion[] {
  const normalized = country?.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  if (euCountries.has(normalized)) {
    return ["EU_EEA_CH"];
  }
  if (normalized === "us" || normalized === "usa" || normalized === "united states") {
    return ["US"];
  }
  if (normalized === "uk" || normalized === "united kingdom") {
    return ["UK"];
  }
  if (normalized === "ca" || normalized === "canada") {
    return ["CA"];
  }
  if (normalized === "au" || normalized === "australia") {
    return ["AU"];
  }
  if (
    normalized === "cn" ||
    normalized === "china" ||
    normalized === "mainland china"
  ) {
    return ["CN"];
  }
  return ["other"];
}

type RouteScopeQuery = Pick<
  RetrievalQuery,
  | "originRegion"
  | "destinationRegion"
  | "operatingCarrier"
  | "operatingCarrierRegion"
  | "provider"
  | "policyRegions"
>;

function includesRouteRegion(
  applicableRegions: PolicyRegion[],
  region: PolicyRouteRegion | undefined
): boolean {
  return Boolean(region && applicableRegions.includes(region));
}

function coarseRegionMatch(
  applicableRegions: PolicyRegion[],
  query: RouteScopeQuery
): boolean {
  return (
    applicableRegions.includes("global") ||
    applicableRegions.some((region) => query.policyRegions.includes(region))
  );
}

export function applicabilityRuleMatches(
  rule: PolicyApplicabilityRule,
  applicableRegions: PolicyRegion[],
  query: RouteScopeQuery
): boolean {
  if (rule === "any_route" || rule === "listed_provider") {
    return true;
  }

  const hasExplicitRoute = Boolean(query.originRegion || query.destinationRegion);
  const originMatches = includesRouteRegion(applicableRegions, query.originRegion);
  const destinationMatches = includesRouteRegion(
    applicableRegions,
    query.destinationRegion
  );
  const carrier = query.operatingCarrier ?? query.provider;

  if (rule === "origin_region") {
    return hasExplicitRoute ? originMatches : coarseRegionMatch(applicableRegions, query);
  }

  if (rule === "origin_or_destination_region") {
    return hasExplicitRoute
      ? originMatches || destinationMatches
      : coarseRegionMatch(applicableRegions, query);
  }

  if (rule === "eu261_route") {
    if (query.originRegion === "EU_EEA_CH") {
      return true;
    }
    if (query.destinationRegion === "EU_EEA_CH") {
      return (
        query.operatingCarrierRegion === "EU_EEA_CH" || isEuOperatingCarrier(carrier)
      );
    }
    return hasExplicitRoute ? false : coarseRegionMatch(applicableRegions, query);
  }

  if (rule === "uk261_route") {
    if (query.originRegion === "UK") {
      return true;
    }
    if (query.destinationRegion === "UK") {
      return (
        query.operatingCarrierRegion === "UK" ||
        query.operatingCarrierRegion === "EU_EEA_CH" ||
        isUkOrEuOperatingCarrier(carrier)
      );
    }
    return hasExplicitRoute ? false : coarseRegionMatch(applicableRegions, query);
  }

  if (rule === "australia_consumer_law") {
    // Inbound Australian coverage can also depend on the booking channel. Keep the
    // policy as a candidate and expose that condition rather than asserting eligibility.
    return hasExplicitRoute
      ? query.originRegion === "AU" || query.destinationRegion === "AU"
      : coarseRegionMatch(applicableRegions, query);
  }

  if (rule === "china_flight_regulation") {
    if (
      query.originRegion === "CN" ||
      query.operatingCarrierRegion === "CN" ||
      isChineseOperatingCarrier(carrier)
    ) {
      return true;
    }
    return hasExplicitRoute ? false : coarseRegionMatch(applicableRegions, query);
  }

  return false;
}

export function policyAppliesToRoute(policy: Policy, query: RouteScopeQuery): boolean {
  return applicabilityRuleMatches(
    policy.applicability_rule,
    policy.applicable_regions,
    query
  );
}
