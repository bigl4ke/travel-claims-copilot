import type { PolicyRouteRegion } from "../types";

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

export type RawLocation = {
  city: string | null;
  airport: string | null;
  country: string | null;
};

export type AssistanceFacts = {
  refundOffered: boolean | null;
  refundAccepted: boolean | null;
  creditOffered: boolean | null;
  creditAccepted: boolean | null;
  reroutingOffered: boolean | null;
  reroutingAccepted: boolean | null;
  replacementTravelOffered: boolean | null;
  replacementTravelAccepted: boolean | null;
  lodgingOffered: boolean | null;
  lodgingAccepted: boolean | null;
  mealsOffered: boolean | null;
  mealsAccepted: boolean | null;
  groundTransportOffered: boolean | null;
  groundTransportAccepted: boolean | null;
};

export type RawClaimFacts = {
  incidentType: CanonicalIncident | null;
  providerType: "hotel" | "airline" | null;
  provider: string | null;
  brandOrProperty: string | null;
  operatingCarrier: string | null;
  origin: RawLocation;
  destination: RawLocation;
  statedReason: string | null;
  reasonCategory:
    | "crew"
    | "mechanical"
    | "oversales"
    | "weather"
    | "late_inbound_aircraft"
    | "other_controllable"
    | "other_uncontrollable"
    | null;
  userInitiatedChange: boolean | null;
  scheduledFinalArrival: string | null;
  actualFinalArrival: string | null;
  finalArrivalDelayMinutes: number | null;
  isOvernight: boolean | null;
  cancellationNoticeHours: number | null;
  assistance: AssistanceFacts;
  deniedBoardingKind: "voluntary" | "involuntary" | null;
  oversalesConfirmed: boolean | null;
  confirmedReservation: boolean | null;
  checkedInOnTime: boolean | null;
  atGateOnTime: boolean | null;
  documentsCompliant: boolean | null;
  replacementArrivalDelayMinutes: number | null;
  confirmedHotelReservation: boolean | null;
  qualifyingHotelReservation: boolean | null;
  bookingChannel: "direct" | "ota" | "portal" | null;
  loyaltyStatus: string | null;
  membershipAttached: boolean | null;
  wasWalked: boolean | null;
  replacementLodgingProvided: boolean | null;
  expenses: string[];
  evidence: string[];
  userGoal: string | null;
};

export const RAW_FACT_PATHS = [
  "incidentType",
  "providerType",
  "provider",
  "brandOrProperty",
  "operatingCarrier",
  "origin.city",
  "origin.airport",
  "origin.country",
  "destination.city",
  "destination.airport",
  "destination.country",
  "statedReason",
  "reasonCategory",
  "userInitiatedChange",
  "scheduledFinalArrival",
  "actualFinalArrival",
  "finalArrivalDelayMinutes",
  "isOvernight",
  "cancellationNoticeHours",
  "assistance.refundOffered",
  "assistance.refundAccepted",
  "assistance.creditOffered",
  "assistance.creditAccepted",
  "assistance.reroutingOffered",
  "assistance.reroutingAccepted",
  "assistance.replacementTravelOffered",
  "assistance.replacementTravelAccepted",
  "assistance.lodgingOffered",
  "assistance.lodgingAccepted",
  "assistance.mealsOffered",
  "assistance.mealsAccepted",
  "assistance.groundTransportOffered",
  "assistance.groundTransportAccepted",
  "deniedBoardingKind",
  "oversalesConfirmed",
  "confirmedReservation",
  "checkedInOnTime",
  "atGateOnTime",
  "documentsCompliant",
  "replacementArrivalDelayMinutes",
  "confirmedHotelReservation",
  "qualifyingHotelReservation",
  "bookingChannel",
  "loyaltyStatus",
  "membershipAttached",
  "wasWalked",
  "replacementLodgingProvided",
  "expenses",
  "evidence",
  "userGoal"
] as const;

export type RawFactPath = (typeof RAW_FACT_PATHS)[number];
export type RawFactValue = string | number | boolean | string[];
export type FactSource =
  | "user_correction"
  | "user_message"
  | "deterministic_extraction"
  | "openai_extraction";
export type FactProvenance = { source: FactSource; factsRevision: number };
export type FactConflict = {
  field: RawFactPath;
  candidates: Array<{
    value: RawFactValue;
    source: "deterministic_extraction" | "openai_extraction";
  }>;
};
export type ClaimState = {
  facts: RawClaimFacts;
  provenance: Partial<Record<RawFactPath, FactProvenance>>;
  revision: number;
  conflicts: FactConflict[];
  unresolvedFields: RawFactPath[];
};

export type ResolvedValue<T> = {
  value: T;
  source:
    | "provider_registry"
    | "airport_registry"
    | "country_rule"
    | "carrier_registry"
    | "reason_rule"
    | "scenario_rule"
    | "insufficient_facts";
  confidence: "low" | "medium" | "high";
  reasons: string[];
};

export type DerivedApplicability = "applies" | "does_not_apply" | "unknown";
export type ResolvedJurisdiction = {
  originRegion: ResolvedValue<PolicyRouteRegion | null>;
  destinationRegion: ResolvedValue<PolicyRouteRegion | null>;
  operatingCarrierRegion: ResolvedValue<PolicyRouteRegion | null>;
  eu261: ResolvedValue<DerivedApplicability>;
  uk261: ResolvedValue<DerivedApplicability>;
};

export type ScenarioDecision = {
  scenarioId: ScenarioId;
  status: "active" | "excluded" | "unresolved";
  reasons: string[];
  missingFacts: RawFactPath[];
};

export type ScenarioResolution =
  | {
      status: "resolved";
      scenarioIds: ScenarioId[];
      primaryScenario: ScenarioId;
      decisions: ScenarioDecision[];
      missingFacts: [];
    }
  | {
      status: "needs_information" | "out_of_scope";
      scenarioIds: [];
      primaryScenario: null;
      decisions: ScenarioDecision[];
      missingFacts: RawFactPath[];
    };

export type ResolvedClaimContext = {
  raw: ClaimState;
  resolutionFacts: RawClaimFacts;
  normalizedProvider: ResolvedValue<string | null>;
  normalizedOperatingCarrier: ResolvedValue<string | null>;
  jurisdiction: ResolvedJurisdiction;
  controllability: ResolvedValue<"controllable" | "uncontrollable" | "unknown">;
  scenarios: ScenarioResolution;
};

export type ResolvedContextWithoutScenarios = Omit<ResolvedClaimContext, "scenarios">;

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
