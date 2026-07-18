import { CANONICAL_INCIDENTS, type CanonicalIncident } from "./claim-contract";

export type IncidentNormalization = {
  incident: CanonicalIncident | null;
  legacy: boolean;
  needsSubtype: boolean;
};

const aliases = {
  controllable_airline_delay: "airline_delay",
  controllable_airline_cancellation: "airline_cancellation"
} as const;

export function normalizeIncidentInput(value: unknown): IncidentNormalization | null {
  if (typeof value !== "string") return null;
  if (CANONICAL_INCIDENTS.includes(value as CanonicalIncident)) {
    return { incident: value as CanonicalIncident, legacy: false, needsSubtype: false };
  }
  if (value in aliases) {
    return {
      incident: aliases[value as keyof typeof aliases],
      legacy: true,
      needsSubtype: false
    };
  }
  if (value === "eu261_delay_or_cancellation") {
    return { incident: null, legacy: true, needsSubtype: true };
  }
  return null;
}
