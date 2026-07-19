import type {
  PolicyApplicability,
  ResolvedClaimContext,
  RetrievalTrace,
  ScenarioId
} from "./claim-contract";
import type { KnowledgeSnapshot } from "../knowledge/knowledge-contract";
import { resolveRetrievalLimits } from "../retrieval-limits";
import { rankApplicablePolicies, rankCases, rankScripts } from "../retrievalScoring";
import type { LegalRegime, Policy, PolicyRouteRegion, RetrievalLimits } from "../types";

type DimensionResult = "matched" | "missing" | "excluded";
type Dimension = "scenario" | "incident" | "route" | "provider_scope" | "controllability";

const scenarioByRegime: Partial<Record<LegalRegime, ScenarioId>> = {
  provider_policy: "marriott_hotel_walk",
  US_DOT_REFUND: "us_airline_disruption",
  US_AIRLINE_COMMITMENT: "us_airline_disruption",
  US_DOT_DENIED_BOARDING: "us_denied_boarding",
  EU261: "eu_uk_air_disruption",
  UK261: "eu_uk_air_disruption"
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function incidentResult(context: ResolvedClaimContext, policy: Policy): DimensionResult {
  const incident = context.resolutionFacts.incidentType;
  if (incident === null) return "missing";
  return policy.incident_types.includes(incident) ? "matched" : "excluded";
}

function scenarioResult(context: ResolvedClaimContext, policy: Policy): DimensionResult {
  const scenarioId = scenarioByRegime[policy.legal_regime];
  if (!scenarioId) return "excluded";
  const decision = context.scenarios.decisions.filter(
    (candidate) => candidate.scenarioId === scenarioId
  )[0];
  if (decision?.status === "active") return "matched";
  if (decision?.status === "unresolved") return "missing";
  return "excluded";
}

function providerResult(context: ResolvedClaimContext, policy: Policy): DimensionResult {
  if (policy.applicable_providers.length === 0) return "matched";
  const candidates = [
    context.normalizedProvider.value,
    context.normalizedOperatingCarrier.value
  ].filter((candidate): candidate is string => Boolean(candidate));
  if (candidates.length === 0) return "missing";
  const allowed = new Set(policy.applicable_providers.map(normalize));
  return candidates.some((candidate) => allowed.has(normalize(candidate))) ? "matched" : "excluded";
}

function matchingScopeValue(context: ResolvedClaimContext, policy: Policy): string | null {
  const allowed = new Set(policy.applicable_providers.map(normalize));
  return (
    [context.normalizedOperatingCarrier.value, context.normalizedProvider.value]
      .filter((candidate): candidate is string => Boolean(candidate))
      .find((candidate) => allowed.has(normalize(candidate))) ?? null
  );
}

function matchesRegion(region: PolicyRouteRegion | null, policy: Policy): DimensionResult {
  if (region === null) return "missing";
  return policy.applicable_regions.includes("global") || policy.applicable_regions.includes(region)
    ? "matched"
    : "excluded";
}

function derivedRouteResult(value: "applies" | "does_not_apply" | "unknown"): DimensionResult {
  if (value === "applies") return "matched";
  if (value === "does_not_apply") return "excluded";
  return "missing";
}

function routeResult(context: ResolvedClaimContext, policy: Policy): DimensionResult {
  const origin = context.jurisdiction.originRegion.value;
  const destination = context.jurisdiction.destinationRegion.value;
  switch (policy.applicability_rule) {
    case "any_route":
    case "listed_provider":
      return "matched";
    case "origin_region":
      return matchesRegion(origin, policy);
    case "origin_or_destination_region": {
      if (
        [origin, destination].some(
          (region) =>
            region !== null &&
            (policy.applicable_regions.includes("global") ||
              policy.applicable_regions.includes(region))
        )
      ) {
        return "matched";
      }
      return origin !== null && destination !== null ? "excluded" : "missing";
    }
    case "eu261_route":
      return derivedRouteResult(context.jurisdiction.eu261.value);
    case "uk261_route":
      return derivedRouteResult(context.jurisdiction.uk261.value);
    case "australia_consumer_law":
      if (origin === "AU") return "matched";
      return origin !== null && destination !== null ? "excluded" : "missing";
    case "china_flight_regulation": {
      const carrierRegion = context.jurisdiction.operatingCarrierRegion.value;
      if (origin === "CN" || carrierRegion === "CN") return "matched";
      return origin !== null && carrierRegion !== null ? "excluded" : "missing";
    }
    default: {
      const exhaustive: never = policy.applicability_rule;
      return exhaustive;
    }
  }
}

function controllabilityResult(context: ResolvedClaimContext, policy: Policy): DimensionResult {
  if (policy.required_controllability === "any") return "matched";
  const actual = context.controllability.value;
  if (actual === "unknown") return "missing";
  return actual === policy.required_controllability ? "matched" : "excluded";
}

export function assessPolicyApplicability(
  context: ResolvedClaimContext,
  policies: readonly Policy[]
): PolicyApplicability[] {
  return policies.map((policy) => {
    const results: Array<[Dimension, DimensionResult]> = [
      ["scenario", scenarioResult(context, policy)],
      ["incident", incidentResult(context, policy)],
      ["route", routeResult(context, policy)],
      ["provider_scope", providerResult(context, policy)],
      ["controllability", controllabilityResult(context, policy)]
    ];
    const matchedConditions = results
      .filter(([, status]) => status === "matched")
      .map(([dimension]) => `${dimension}_matched`);
    const missingConditions = results
      .filter(([, status]) => status === "missing")
      .map(([dimension]) => `${dimension}_missing`);
    const exclusions = results
      .filter(([, status]) => status === "excluded")
      .map(([dimension]) => `${dimension}_excluded`);
    let status: PolicyApplicability["status"] = "applicable";
    if (exclusions.length > 0) status = "not_applicable";
    else if (missingConditions.length > 0) status = "conditional";
    return {
      policy,
      status,
      matchedConditions,
      missingConditions,
      exclusions,
      applicableCarrier: matchingScopeValue(context, policy)
    };
  });
}

export function regimesFromApplicability(
  assessments: readonly PolicyApplicability[]
): LegalRegime[] {
  const regimes = assessments
    .filter(({ status }) => status !== "not_applicable")
    .map(({ policy }) => policy.legal_regime);
  return [...new Set(regimes)];
}

export function buildUnrankedRetrievalTrace(
  context: ResolvedClaimContext,
  knowledge: KnowledgeSnapshot
): RetrievalTrace {
  return {
    policyApplicability: assessPolicyApplicability(context, knowledge.policies),
    displayedPolicies: [],
    displayedCases: [],
    displayedScripts: []
  };
}

export function buildRetrievalTrace(
  context: ResolvedClaimContext,
  knowledge: KnowledgeSnapshot,
  limits: RetrievalLimits
): RetrievalTrace {
  const resolvedLimits = resolveRetrievalLimits(limits);
  const policyApplicability = assessPolicyApplicability(context, knowledge.policies);
  const admissiblePolicyIds = new Set(
    policyApplicability
      .filter(({ status }) => status === "applicable" || status === "conditional")
      .map(({ policy }) => policy.policy_id)
  );
  return {
    policyApplicability,
    displayedPolicies: rankApplicablePolicies(
      context,
      policyApplicability,
      resolvedLimits.policyLimit
    ),
    displayedCases: rankCases(context, knowledge.cases, resolvedLimits.caseLimit),
    displayedScripts: rankScripts(
      context,
      knowledge.scripts,
      admissiblePolicyIds,
      resolvedLimits.scriptLimit
    )
  };
}
