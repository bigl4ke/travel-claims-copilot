import { resolveClaimContext, resolveKnownLocation } from "./domain/context-resolver";
import type { ClaimState, RawClaimFacts } from "./domain/claim-contract";
import { emptyRawClaimFacts } from "./domain/raw-fact-schema";
import type { MvpIssueType, PolicyRouteRegion } from "./types";

export type ClaimIssueType = MvpIssueType | "unknown";
export type ClaimProviderType = "hotel" | "airline" | "unknown";
export type ClaimRegion = PolicyRouteRegion;
export type ClaimDisruptionType =
  | "hotel_walk"
  | "delay"
  | "cancellation"
  | "denied_boarding"
  | "unknown";
export type ClaimDisruptionReason =
  | "crew"
  | "mechanical"
  | "oversales"
  | "weather"
  | "late_inbound_aircraft"
  | "other_controllable"
  | "unknown";
export type ClaimDeniedBoardingKind = "voluntary" | "involuntary" | "unknown";
export type ClaimBookingChannel = "direct" | "ota" | "portal" | "unknown";

export type ClaimLocation = {
  city: string | null;
  airport: string | null;
  country: string | null;
  region: ClaimRegion | null;
};

export type ClaimFacts = {
  issueType: ClaimIssueType;
  providerType: ClaimProviderType;
  provider: string | null;
  operatingCarrier: string | null;
  operatingCarrierRegion: ClaimRegion | null;
  origin: ClaimLocation;
  destination: ClaimLocation;
  disruptionType: ClaimDisruptionType;
  disruptionReason: ClaimDisruptionReason;
  arrivalDelayMinutes: number | null;
  isOvernight: boolean | null;
  deniedBoardingKind: ClaimDeniedBoardingKind;
  bookingChannel: ClaimBookingChannel;
  loyaltyStatus: string | null;
  expenses: string[];
  evidence: string[];
  userGoal: string | null;
  confidence: "low" | "medium" | "high";
};

export type ClaimFactField =
  | "issueType"
  | "providerType"
  | "provider"
  | "origin"
  | "destination"
  | "disruptionType"
  | "disruptionReason"
  | "arrivalDelayMinutes"
  | "deniedBoardingKind";

export type ClaimFactsParseResult =
  | { success: true; data: ClaimFacts }
  | { success: false; errors: string[] };

const issueTypes: ClaimIssueType[] = [
  "hotel_walk",
  "airline_delay",
  "airline_cancellation",
  "denied_boarding",
  "unknown"
];
const providerTypes: ClaimProviderType[] = ["hotel", "airline", "unknown"];
const regions: ClaimRegion[] = ["EU_EEA_CH", "UK", "US", "CA", "AU", "CN", "other"];
const disruptionTypes: ClaimDisruptionType[] = [
  "hotel_walk",
  "delay",
  "cancellation",
  "denied_boarding",
  "unknown"
];
const disruptionReasons: ClaimDisruptionReason[] = [
  "crew",
  "mechanical",
  "oversales",
  "weather",
  "late_inbound_aircraft",
  "other_controllable",
  "unknown"
];
const deniedBoardingKinds: ClaimDeniedBoardingKind[] = ["voluntary", "involuntary", "unknown"];
const bookingChannels: ClaimBookingChannel[] = ["direct", "ota", "portal", "unknown"];
const confidenceLevels: ClaimFacts["confidence"][] = ["low", "medium", "high"];

const nullableStringSchema = {
  anyOf: [{ type: "string" }, { type: "null" }]
} as const;
const locationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    city: nullableStringSchema,
    airport: nullableStringSchema,
    country: nullableStringSchema,
    region: { anyOf: [{ type: "string", enum: regions }, { type: "null" }] }
  },
  required: ["city", "airport", "country", "region"]
} as const;

export const claimFactsJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    issueType: { type: "string", enum: issueTypes },
    providerType: { type: "string", enum: providerTypes },
    provider: nullableStringSchema,
    operatingCarrier: nullableStringSchema,
    operatingCarrierRegion: {
      anyOf: [{ type: "string", enum: regions }, { type: "null" }]
    },
    origin: locationSchema,
    destination: locationSchema,
    disruptionType: { type: "string", enum: disruptionTypes },
    disruptionReason: { type: "string", enum: disruptionReasons },
    arrivalDelayMinutes: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
    isOvernight: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    deniedBoardingKind: { type: "string", enum: deniedBoardingKinds },
    bookingChannel: { type: "string", enum: bookingChannels },
    loyaltyStatus: nullableStringSchema,
    expenses: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: { type: "string" } },
    userGoal: nullableStringSchema,
    confidence: { type: "string", enum: confidenceLevels }
  },
  required: [
    "issueType",
    "providerType",
    "provider",
    "operatingCarrier",
    "operatingCarrierRegion",
    "origin",
    "destination",
    "disruptionType",
    "disruptionReason",
    "arrivalDelayMinutes",
    "isOvernight",
    "deniedBoardingKind",
    "bookingChannel",
    "loyaltyStatus",
    "expenses",
    "evidence",
    "userGoal",
    "confidence"
  ]
} as const;

export function emptyClaimLocation(): ClaimLocation {
  return { city: null, airport: null, country: null, region: null };
}

export function emptyClaimFacts(): ClaimFacts {
  return {
    issueType: "unknown",
    providerType: "unknown",
    provider: null,
    operatingCarrier: null,
    operatingCarrierRegion: null,
    origin: emptyClaimLocation(),
    destination: emptyClaimLocation(),
    disruptionType: "unknown",
    disruptionReason: "unknown",
    arrivalDelayMinutes: null,
    isOvernight: null,
    deniedBoardingKind: "unknown",
    bookingChannel: "unknown",
    loyaltyStatus: null,
    expenses: [],
    evidence: [],
    userGoal: null,
    confidence: "low"
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  errors: string[]
): T | undefined {
  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T;
  }

  errors.push(`${path} must be one of: ${allowed.join(", ")}`);
  return undefined;
}

function parseNullableString(value: unknown, path: string, errors: string[]): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  errors.push(`${path} must be a string or null`);
  return null;
}

function parseStringArray(value: unknown, path: string, errors: string[]): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${path} must be an array of strings`);
    return [];
  }

  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
}

function parseLocation(value: unknown, path: string, errors: string[]): ClaimLocation {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return emptyClaimLocation();
  }

  const region =
    value.region === null
      ? null
      : (parseEnum(value.region, regions, `${path}.region`, errors) ?? null);

  return {
    city: parseNullableString(value.city, `${path}.city`, errors),
    airport: parseNullableString(value.airport, `${path}.airport`, errors),
    country: parseNullableString(value.country, `${path}.country`, errors),
    region
  };
}

export function parseClaimFacts(value: unknown): ClaimFactsParseResult {
  if (!isRecord(value)) {
    return { success: false, errors: ["facts must be an object"] };
  }

  const errors: string[] = [];
  let arrivalDelayMinutes: number | null = null;
  if (
    typeof value.arrivalDelayMinutes === "number" &&
    Number.isInteger(value.arrivalDelayMinutes) &&
    value.arrivalDelayMinutes >= 0
  ) {
    arrivalDelayMinutes = value.arrivalDelayMinutes;
  } else if (value.arrivalDelayMinutes !== null) {
    errors.push("arrivalDelayMinutes must be a non-negative integer or null");
  }

  let isOvernight: boolean | null = null;
  if (typeof value.isOvernight === "boolean") {
    isOvernight = value.isOvernight;
  } else if (value.isOvernight !== null) {
    errors.push("isOvernight must be a boolean or null");
  }

  const facts: ClaimFacts = {
    issueType: parseEnum(value.issueType, issueTypes, "issueType", errors) ?? "unknown",
    providerType: parseEnum(value.providerType, providerTypes, "providerType", errors) ?? "unknown",
    provider: parseNullableString(value.provider, "provider", errors),
    operatingCarrier: parseNullableString(value.operatingCarrier, "operatingCarrier", errors),
    operatingCarrierRegion:
      value.operatingCarrierRegion === null
        ? null
        : (parseEnum(value.operatingCarrierRegion, regions, "operatingCarrierRegion", errors) ??
          null),
    origin: parseLocation(value.origin, "origin", errors),
    destination: parseLocation(value.destination, "destination", errors),
    disruptionType:
      parseEnum(value.disruptionType, disruptionTypes, "disruptionType", errors) ?? "unknown",
    disruptionReason:
      parseEnum(value.disruptionReason, disruptionReasons, "disruptionReason", errors) ?? "unknown",
    arrivalDelayMinutes,
    isOvernight,
    deniedBoardingKind:
      parseEnum(value.deniedBoardingKind, deniedBoardingKinds, "deniedBoardingKind", errors) ??
      "unknown",
    bookingChannel:
      parseEnum(value.bookingChannel, bookingChannels, "bookingChannel", errors) ?? "unknown",
    loyaltyStatus: parseNullableString(value.loyaltyStatus, "loyaltyStatus", errors),
    expenses: parseStringArray(value.expenses, "expenses", errors),
    evidence: parseStringArray(value.evidence, "evidence", errors),
    userGoal: parseNullableString(value.userGoal, "userGoal", errors),
    confidence: parseEnum(value.confidence, confidenceLevels, "confidence", errors) ?? "low"
  };

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: normalizeClaimFacts(facts) };
}

function legacyToRawFacts(facts: ClaimFacts): RawClaimFacts {
  const empty = emptyRawClaimFacts();
  return {
    ...empty,
    incidentType: facts.issueType === "unknown" ? null : facts.issueType,
    providerType: facts.providerType === "unknown" ? null : facts.providerType,
    provider: facts.provider,
    operatingCarrier: facts.operatingCarrier,
    origin: {
      city: facts.origin.city,
      airport: facts.origin.airport,
      country: facts.origin.country
    },
    destination: {
      city: facts.destination.city,
      airport: facts.destination.airport,
      country: facts.destination.country
    },
    reasonCategory: facts.disruptionReason === "unknown" ? null : facts.disruptionReason,
    finalArrivalDelayMinutes: facts.arrivalDelayMinutes,
    isOvernight: facts.isOvernight,
    deniedBoardingKind: facts.deniedBoardingKind === "unknown" ? null : facts.deniedBoardingKind,
    bookingChannel: facts.bookingChannel === "unknown" ? null : facts.bookingChannel,
    loyaltyStatus: facts.loyaltyStatus,
    expenses: [...facts.expenses],
    evidence: [...facts.evidence],
    userGoal: facts.userGoal
  };
}

export function normalizeClaimFacts(facts: ClaimFacts): ClaimFacts {
  const rawFacts = legacyToRawFacts(facts);
  const state: ClaimState = {
    facts: rawFacts,
    provenance: {},
    revision: 0,
    conflicts: [],
    unresolvedFields: []
  };
  const context = resolveClaimContext({ state });
  const origin = resolveKnownLocation(rawFacts.origin);
  const destination = resolveKnownLocation(rawFacts.destination);
  let { disruptionType } = facts;
  if (disruptionType === "unknown") {
    const disruptionTypeByIssue: Partial<Record<ClaimIssueType, ClaimDisruptionType>> = {
      hotel_walk: "hotel_walk",
      airline_delay: "delay",
      airline_cancellation: "cancellation",
      denied_boarding: "denied_boarding"
    };
    disruptionType = disruptionTypeByIssue[facts.issueType] ?? "unknown";
  }

  let { providerType } = facts;
  if (providerType === "unknown") {
    if (facts.issueType === "hotel_walk") {
      providerType = "hotel";
    } else if (facts.issueType !== "unknown") {
      providerType = "airline";
    }
  }

  return {
    ...facts,
    providerType,
    provider: context.normalizedProvider.value,
    operatingCarrier: context.normalizedOperatingCarrier.value,
    operatingCarrierRegion: context.jurisdiction.operatingCarrierRegion.value,
    origin: {
      city: origin.city,
      airport: origin.airport,
      country: origin.country,
      region: context.jurisdiction.originRegion.value
    },
    destination: {
      city: destination.city,
      airport: destination.airport,
      country: destination.country,
      region: context.jurisdiction.destinationRegion.value
    },
    disruptionType
  };
}

function hasLocation(location: ClaimLocation): boolean {
  return Boolean(location.airport || location.city || location.country);
}

export function getMissingClaimFields(facts: ClaimFacts): ClaimFactField[] {
  const normalized = normalizeClaimFacts(facts);
  const missing: ClaimFactField[] = [];

  if (normalized.issueType === "unknown") {
    return ["issueType"];
  }
  if (normalized.providerType === "unknown") {
    missing.push("providerType");
  }
  if (!normalized.provider && !normalized.operatingCarrier) {
    missing.push("provider");
  }

  if (normalized.issueType === "airline_delay" || normalized.issueType === "airline_cancellation") {
    if (!hasLocation(normalized.origin)) {
      missing.push("origin");
    }
    if (!hasLocation(normalized.destination)) {
      missing.push("destination");
    }
    if (normalized.issueType === "airline_delay" && normalized.arrivalDelayMinutes === null) {
      missing.push("arrivalDelayMinutes");
    }
    if (normalized.disruptionReason === "unknown") {
      missing.push("disruptionReason");
    }
  }

  if (normalized.issueType === "denied_boarding") {
    if (!hasLocation(normalized.origin)) {
      missing.push("origin");
    }
    if (normalized.deniedBoardingKind === "unknown") {
      missing.push("deniedBoardingKind");
    }
  }

  return missing;
}
