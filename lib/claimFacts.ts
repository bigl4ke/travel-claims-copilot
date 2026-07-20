import { enrichClaimJurisdiction } from "./jurisdiction";
import { canonicalizeProviderName } from "./provider";
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
export type ClaimDisruptionReasonStatus =
  | "not_provided"
  | "reported"
  | "unavailable";
export type ClaimDeniedBoardingKind = "voluntary" | "involuntary" | "unknown";
export type ClaimBookingChannel =
  | "direct"
  | "ota"
  | "portal"
  | "travel_agent"
  | "corporate_travel"
  | "unknown";
export type ClaimJourneyStage =
  | "pre_trip"
  | "at_airport"
  | "en_route"
  | "completed"
  | "unknown";
export type ClaimDisruptionTiming =
  | "planned_schedule_change"
  | "close_in_irrops"
  | "unknown";
export type ClaimTicketType = "cash" | "award" | "unknown";
export type ClaimRecoveryPriority =
  | "earliest_arrival"
  | "same_date"
  | "nonstop"
  | "same_airport"
  | "same_cabin"
  | "preserve_trip_length";

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
  validatingCarrier: string | null;
  marketingCarrier: string | null;
  operatingCarrier: string | null;
  disruptingCarrier: string | null;
  operatingCarrierRegion: ClaimRegion | null;
  origin: ClaimLocation;
  destination: ClaimLocation;
  disruptionType: ClaimDisruptionType;
  disruptionReason: ClaimDisruptionReason;
  disruptionReasonStatus: ClaimDisruptionReasonStatus;
  arrivalDelayMinutes: number | null;
  isOvernight: boolean | null;
  deniedBoardingKind: ClaimDeniedBoardingKind;
  bookingChannel: ClaimBookingChannel;
  bookingProvider: string | null;
  journeyStage: ClaimJourneyStage;
  disruptionTiming: ClaimDisruptionTiming;
  ticketType: ClaimTicketType;
  awardProgram: string | null;
  autoRebooked: boolean | null;
  autoRebookedItinerary: string | null;
  recoveryPriorities: ClaimRecoveryPriority[];
  preferredAlternatives: string[];
  hasConnectionsOrReturnSegments: boolean | null;
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
  | "deniedBoardingKind"
  | "bookingChannel"
  | "journeyStage"
  | "disruptionTiming"
  | "ticketType"
  | "validatingCarrier"
  | "autoRebooked"
  | "recoveryPriorities";

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
const disruptionReasonStatuses: ClaimDisruptionReasonStatus[] = [
  "not_provided",
  "reported",
  "unavailable"
];
const deniedBoardingKinds: ClaimDeniedBoardingKind[] = [
  "voluntary",
  "involuntary",
  "unknown"
];
const bookingChannels: ClaimBookingChannel[] = [
  "direct",
  "ota",
  "portal",
  "travel_agent",
  "corporate_travel",
  "unknown"
];
const journeyStages: ClaimJourneyStage[] = [
  "pre_trip",
  "at_airport",
  "en_route",
  "completed",
  "unknown"
];
const disruptionTimings: ClaimDisruptionTiming[] = [
  "planned_schedule_change",
  "close_in_irrops",
  "unknown"
];
const ticketTypes: ClaimTicketType[] = ["cash", "award", "unknown"];
const recoveryPriorities: ClaimRecoveryPriority[] = [
  "earliest_arrival",
  "same_date",
  "nonstop",
  "same_airport",
  "same_cabin",
  "preserve_trip_length"
];
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
    validatingCarrier: nullableStringSchema,
    marketingCarrier: nullableStringSchema,
    operatingCarrier: nullableStringSchema,
    disruptingCarrier: nullableStringSchema,
    operatingCarrierRegion: {
      anyOf: [{ type: "string", enum: regions }, { type: "null" }]
    },
    origin: locationSchema,
    destination: locationSchema,
    disruptionType: { type: "string", enum: disruptionTypes },
    disruptionReason: { type: "string", enum: disruptionReasons },
    disruptionReasonStatus: { type: "string", enum: disruptionReasonStatuses },
    arrivalDelayMinutes: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
    isOvernight: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    deniedBoardingKind: { type: "string", enum: deniedBoardingKinds },
    bookingChannel: { type: "string", enum: bookingChannels },
    bookingProvider: nullableStringSchema,
    journeyStage: { type: "string", enum: journeyStages },
    disruptionTiming: { type: "string", enum: disruptionTimings },
    ticketType: { type: "string", enum: ticketTypes },
    awardProgram: nullableStringSchema,
    autoRebooked: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    autoRebookedItinerary: nullableStringSchema,
    recoveryPriorities: {
      type: "array",
      items: { type: "string", enum: recoveryPriorities }
    },
    preferredAlternatives: { type: "array", items: { type: "string" } },
    hasConnectionsOrReturnSegments: {
      anyOf: [{ type: "boolean" }, { type: "null" }]
    },
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
    "validatingCarrier",
    "marketingCarrier",
    "operatingCarrier",
    "disruptingCarrier",
    "operatingCarrierRegion",
    "origin",
    "destination",
    "disruptionType",
    "disruptionReason",
    "disruptionReasonStatus",
    "arrivalDelayMinutes",
    "isOvernight",
    "deniedBoardingKind",
    "bookingChannel",
    "bookingProvider",
    "journeyStage",
    "disruptionTiming",
    "ticketType",
    "awardProgram",
    "autoRebooked",
    "autoRebookedItinerary",
    "recoveryPriorities",
    "preferredAlternatives",
    "hasConnectionsOrReturnSegments",
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
    validatingCarrier: null,
    marketingCarrier: null,
    operatingCarrier: null,
    disruptingCarrier: null,
    operatingCarrierRegion: null,
    origin: emptyClaimLocation(),
    destination: emptyClaimLocation(),
    disruptionType: "unknown",
    disruptionReason: "unknown",
    disruptionReasonStatus: "not_provided",
    arrivalDelayMinutes: null,
    isOvernight: null,
    deniedBoardingKind: "unknown",
    bookingChannel: "unknown",
    bookingProvider: null,
    journeyStage: "unknown",
    disruptionTiming: "unknown",
    ticketType: "unknown",
    awardProgram: null,
    autoRebooked: null,
    autoRebookedItinerary: null,
    recoveryPriorities: [],
    preferredAlternatives: [],
    hasConnectionsOrReturnSegments: null,
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

function parseOptionalNullableString(
  value: unknown,
  path: string,
  errors: string[]
): string | null {
  return value === undefined ? null : parseNullableString(value, path, errors);
}

function parseOptionalBoolean(
  value: unknown,
  path: string,
  errors: string[]
): boolean | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }

  errors.push(`${path} must be a boolean or null`);
  return null;
}

function parseRecoveryPriorities(
  value: unknown,
  errors: string[]
): ClaimRecoveryPriority[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push("recoveryPriorities must be an array");
    return [];
  }

  const parsed = value
    .map((item, index) =>
      parseEnum(item, recoveryPriorities, `recoveryPriorities[${index}]`, errors)
    )
    .filter((item): item is ClaimRecoveryPriority => Boolean(item));
  return Array.from(new Set(parsed));
}

function parseLocation(value: unknown, path: string, errors: string[]): ClaimLocation {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return emptyClaimLocation();
  }

  const region = value.region === null
    ? null
    : parseEnum(value.region, regions, `${path}.region`, errors) ?? null;

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
  const arrivalDelayMinutes = value.arrivalDelayMinutes === null
    ? null
    : typeof value.arrivalDelayMinutes === "number" &&
        Number.isInteger(value.arrivalDelayMinutes) &&
        value.arrivalDelayMinutes >= 0
      ? value.arrivalDelayMinutes
      : (errors.push("arrivalDelayMinutes must be a non-negative integer or null"), null);
  const isOvernight = value.isOvernight === null || typeof value.isOvernight === "boolean"
    ? value.isOvernight
    : (errors.push("isOvernight must be a boolean or null"), null);

  const facts: ClaimFacts = {
    issueType: parseEnum(value.issueType, issueTypes, "issueType", errors) ?? "unknown",
    providerType:
      parseEnum(value.providerType, providerTypes, "providerType", errors) ?? "unknown",
    provider: parseNullableString(value.provider, "provider", errors),
    validatingCarrier: parseOptionalNullableString(
      value.validatingCarrier,
      "validatingCarrier",
      errors
    ),
    marketingCarrier: parseOptionalNullableString(
      value.marketingCarrier,
      "marketingCarrier",
      errors
    ),
    operatingCarrier: parseNullableString(value.operatingCarrier, "operatingCarrier", errors),
    disruptingCarrier: parseOptionalNullableString(
      value.disruptingCarrier,
      "disruptingCarrier",
      errors
    ),
    operatingCarrierRegion:
      value.operatingCarrierRegion === null
        ? null
        : parseEnum(
            value.operatingCarrierRegion,
            regions,
            "operatingCarrierRegion",
            errors
          ) ?? null,
    origin: parseLocation(value.origin, "origin", errors),
    destination: parseLocation(value.destination, "destination", errors),
    disruptionType:
      parseEnum(value.disruptionType, disruptionTypes, "disruptionType", errors) ?? "unknown",
    disruptionReason:
      parseEnum(value.disruptionReason, disruptionReasons, "disruptionReason", errors) ?? "unknown",
    disruptionReasonStatus:
      value.disruptionReasonStatus === undefined
        ? "not_provided"
        : parseEnum(
            value.disruptionReasonStatus,
            disruptionReasonStatuses,
            "disruptionReasonStatus",
            errors
          ) ?? "not_provided",
    arrivalDelayMinutes,
    isOvernight,
    deniedBoardingKind:
      parseEnum(value.deniedBoardingKind, deniedBoardingKinds, "deniedBoardingKind", errors) ??
      "unknown",
    bookingChannel:
      parseEnum(value.bookingChannel, bookingChannels, "bookingChannel", errors) ?? "unknown",
    bookingProvider: parseOptionalNullableString(
      value.bookingProvider,
      "bookingProvider",
      errors
    ),
    journeyStage:
      value.journeyStage === undefined
        ? "unknown"
        : parseEnum(value.journeyStage, journeyStages, "journeyStage", errors) ?? "unknown",
    disruptionTiming:
      value.disruptionTiming === undefined
        ? "unknown"
        : parseEnum(
            value.disruptionTiming,
            disruptionTimings,
            "disruptionTiming",
            errors
          ) ?? "unknown",
    ticketType:
      value.ticketType === undefined
        ? "unknown"
        : parseEnum(value.ticketType, ticketTypes, "ticketType", errors) ?? "unknown",
    awardProgram: parseOptionalNullableString(value.awardProgram, "awardProgram", errors),
    autoRebooked: parseOptionalBoolean(value.autoRebooked, "autoRebooked", errors),
    autoRebookedItinerary: parseOptionalNullableString(
      value.autoRebookedItinerary,
      "autoRebookedItinerary",
      errors
    ),
    recoveryPriorities: parseRecoveryPriorities(value.recoveryPriorities, errors),
    preferredAlternatives:
      value.preferredAlternatives === undefined
        ? []
        : parseStringArray(value.preferredAlternatives, "preferredAlternatives", errors),
    hasConnectionsOrReturnSegments: parseOptionalBoolean(
      value.hasConnectionsOrReturnSegments,
      "hasConnectionsOrReturnSegments",
      errors
    ),
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

export function normalizeClaimFacts(facts: ClaimFacts): ClaimFacts {
  const normalized = enrichClaimJurisdiction(facts);
  const disruptionType = normalized.disruptionType === "unknown"
    ? normalized.issueType === "hotel_walk"
      ? "hotel_walk"
      : normalized.issueType === "airline_delay"
        ? "delay"
        : normalized.issueType === "airline_cancellation"
          ? "cancellation"
          : normalized.issueType === "denied_boarding"
            ? "denied_boarding"
            : "unknown"
    : normalized.disruptionType;
  const providerType = normalized.providerType === "unknown"
    ? normalized.issueType === "hotel_walk"
      ? "hotel"
      : normalized.issueType !== "unknown"
        ? "airline"
        : "unknown"
    : normalized.providerType;
  const disruptionReasonStatus = normalized.disruptionReason !== "unknown"
    ? "reported"
    : normalized.disruptionReasonStatus === "unavailable"
      ? "unavailable"
      : "not_provided";

  return {
    ...normalized,
    providerType,
    provider: canonicalizeProviderName(normalized.provider, providerType),
    validatingCarrier: canonicalizeProviderName(normalized.validatingCarrier, "airline"),
    marketingCarrier: canonicalizeProviderName(normalized.marketingCarrier, "airline"),
    operatingCarrier: canonicalizeProviderName(normalized.operatingCarrier, "airline"),
    disruptingCarrier: canonicalizeProviderName(normalized.disruptingCarrier, "airline"),
    disruptionType,
    disruptionReasonStatus
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

  if (
    normalized.issueType === "airline_delay" ||
    normalized.issueType === "airline_cancellation"
  ) {
    if (!hasLocation(normalized.origin)) {
      missing.push("origin");
    }
    if (!hasLocation(normalized.destination)) {
      missing.push("destination");
    }
    if (normalized.issueType === "airline_delay" && normalized.arrivalDelayMinutes === null) {
      missing.push("arrivalDelayMinutes");
    }
    if (
      normalized.disruptionReason === "unknown" &&
      normalized.disruptionReasonStatus === "not_provided"
    ) {
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

export function getMissingIntakeFields(facts: ClaimFacts): ClaimFactField[] {
  const requiredForAnalysis = getMissingClaimFields(facts);
  if (requiredForAnalysis.length > 0) {
    return requiredForAnalysis;
  }

  const normalized = normalizeClaimFacts(facts);
  if (normalized.providerType !== "airline") {
    return [];
  }

  if (normalized.journeyStage === "unknown") {
    return ["journeyStage"];
  }

  if (normalized.journeyStage !== "pre_trip") {
    return [];
  }

  const missing: ClaimFactField[] = [];
  if (normalized.disruptionTiming === "unknown") {
    missing.push("disruptionTiming");
  }
  if (normalized.bookingChannel === "unknown") {
    missing.push("bookingChannel");
  }
  if (normalized.ticketType === "unknown") {
    missing.push("ticketType");
  }
  if (
    normalized.ticketType === "award" &&
    !normalized.awardProgram &&
    !normalized.validatingCarrier
  ) {
    missing.push("validatingCarrier");
  }
  if (normalized.autoRebooked === null) {
    missing.push("autoRebooked");
  }

  return missing;
}
