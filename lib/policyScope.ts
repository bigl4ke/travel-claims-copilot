import type { ClaimDisruptionReason } from "./claimFacts";
import type { Controllability, PolicyRegion } from "./types";

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
  return ["other"];
}
