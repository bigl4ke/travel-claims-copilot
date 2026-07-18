export const CANONICAL_INCIDENTS = [
  "hotel_walk",
  "airline_delay",
  "airline_cancellation",
  "denied_boarding"
] as const;

export type CanonicalIncident = (typeof CANONICAL_INCIDENTS)[number];
export type LegacyIncidentAlias =
  | "controllable_airline_delay"
  | "controllable_airline_cancellation"
  | "eu261_delay_or_cancellation";
export type ScenarioId =
  | "marriott_hotel_walk"
  | "us_airline_disruption"
  | "us_denied_boarding"
  | "eu_uk_air_disruption";
export type WorkflowStatus =
  | "ready"
  | "needs_information"
  | "out_of_scope"
  | "unsupported_high_risk";
export type ExtractionMode = "gpt" | "local";
export type ExtractionProvider = "openai" | "local";
export type RemedyStatus = "supported" | "conditional" | "not_applicable";

export type PublicScenarioSummary = {
  id: ScenarioId;
  label: string;
};

export const PUBLIC_SCENARIOS: readonly PublicScenarioSummary[] = [
  { id: "marriott_hotel_walk", label: "Marriott hotel walk" },
  { id: "us_airline_disruption", label: "US airline delay or cancellation" },
  { id: "us_denied_boarding", label: "US denied boarding" },
  { id: "eu_uk_air_disruption", label: "EU/UK airline delay or cancellation" }
];

export function getPublicScenarioCatalog(): readonly PublicScenarioSummary[] {
  return PUBLIC_SCENARIOS;
}
