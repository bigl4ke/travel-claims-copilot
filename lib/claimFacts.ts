import { enrichClaimJurisdiction } from "./jurisdiction";
import type { MvpIssueType } from "./types";

export type ClaimIssueType = MvpIssueType | "unknown";
export type ClaimProviderType = "hotel" | "airline" | "unknown";
export type ClaimRegion = "EU_EEA_CH" | "UK" | "US" | "other";
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
  "controllable_airline_delay",
  "controllable_airline_cancellation",
  "denied_boarding",
  "eu261_delay_or_cancellation",
  "unknown"
];
const providerTypes: ClaimProviderType[] = ["hotel", "airline", "unknown"];
const regions: ClaimRegion[] = ["EU_EEA_CH", "UK", "US", "other"];
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
  "other_controllable",
  "unknown"
];
const deniedBoardingKinds: ClaimDeniedBoardingKind[] = [
  "voluntary",
  "involuntary",
  "unknown"
];
const bookingChannels: ClaimBookingChannel[] = ["direct", "ota", "portal", "unknown"];
const confidenceLevels: ClaimFacts["confidence"][] = ["low", "medium", "high"];

const nullableStringSchema = { type: ["string", "null"] } as const;
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
    origin: locationSchema,
    destination: locationSchema,
    disruptionType: { type: "string", enum: disruptionTypes },
    disruptionReason: { type: "string", enum: disruptionReasons },
    arrivalDelayMinutes: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
    isOvernight: { type: ["boolean", "null"] },
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
    operatingCarrier: parseNullableString(value.operatingCarrier, "operatingCarrier", errors),
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

export function normalizeClaimFacts(facts: ClaimFacts): ClaimFacts {
  const normalized = enrichClaimJurisdiction(facts);
  const providerType = normalized.providerType === "unknown"
    ? normalized.issueType === "hotel_walk"
      ? "hotel"
      : normalized.issueType !== "unknown"
        ? "airline"
        : "unknown"
    : normalized.providerType;
  const disruptionType = normalized.disruptionType === "unknown"
    ? normalized.issueType === "hotel_walk"
      ? "hotel_walk"
      : normalized.issueType === "controllable_airline_delay"
        ? "delay"
        : normalized.issueType === "controllable_airline_cancellation"
          ? "cancellation"
          : normalized.issueType === "denied_boarding"
            ? "denied_boarding"
            : "unknown"
    : normalized.disruptionType;

  return { ...normalized, providerType, disruptionType };
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
    normalized.issueType === "controllable_airline_delay" ||
    normalized.issueType === "controllable_airline_cancellation"
  ) {
    if (normalized.disruptionReason === "unknown") {
      missing.push("disruptionReason");
    }
  }

  if (normalized.issueType === "denied_boarding" && normalized.deniedBoardingKind === "unknown") {
    missing.push("deniedBoardingKind");
  }

  if (normalized.issueType === "eu261_delay_or_cancellation") {
    if (!hasLocation(normalized.origin)) {
      missing.push("origin");
    }
    if (!hasLocation(normalized.destination)) {
      missing.push("destination");
    }
    if (normalized.disruptionType === "unknown") {
      missing.push("disruptionType");
    }
    if (normalized.arrivalDelayMinutes === null) {
      missing.push("arrivalDelayMinutes");
    }
    if (normalized.disruptionReason === "unknown") {
      missing.push("disruptionReason");
    }
  }

  return missing;
}

