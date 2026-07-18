import type { ClaimDisruptionReason } from "./claimFacts";
import {
  isChineseCarrierValue,
  isEuCarrierValue,
  isUkOrEuCarrierValue,
  policyRegionsFromCountryValue,
  resolveControllability
} from "./domain/context-resolver";
import type {
  Controllability,
  Policy,
  PolicyApplicabilityRule,
  PolicyRegion,
  PolicyRouteRegion,
  RetrievalQuery
} from "./types";

export function controllabilityFromReason(
  reason: ClaimDisruptionReason | undefined
): Controllability {
  return resolveControllability(reason === "unknown" ? null : reason).value;
}

export function policyRegionsFromCountry(country: string | undefined): PolicyRegion[] {
  return policyRegionsFromCountryValue(country);
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

function coarseRegionMatch(applicableRegions: PolicyRegion[], query: RouteScopeQuery): boolean {
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
  const destinationMatches = includesRouteRegion(applicableRegions, query.destinationRegion);
  const carrier = query.operatingCarrier;

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
      return query.operatingCarrierRegion === "EU_EEA_CH" || isEuCarrierValue(carrier);
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
        isUkOrEuCarrierValue(carrier)
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
      isChineseCarrierValue(carrier)
    ) {
      return true;
    }
    return hasExplicitRoute ? false : coarseRegionMatch(applicableRegions, query);
  }

  return false;
}

export function policyAppliesToRoute(policy: Policy, query: RouteScopeQuery): boolean {
  return applicabilityRuleMatches(policy.applicability_rule, policy.applicable_regions, query);
}
