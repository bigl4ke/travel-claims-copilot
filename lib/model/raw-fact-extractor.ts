/* eslint-disable max-classes-per-file -- frozen extractor implementations share this boundary */
import { classifyInput } from "../classifier";
import { INPUT_LIMITS } from "../api/input-limits";
import { inferRouteLocationsValue, findCanonicalProviderMatch } from "../domain/context-resolver";
import {
  CANONICAL_INCIDENTS,
  RAW_FACT_PATHS,
  type ExtractionProvider,
  type RawClaimFacts,
  type RawFactPatch
} from "../domain/claim-contract";
import { parseRawFactPatch, rawFactPatchJsonSchema } from "../domain/raw-fact-schema";
import type { StructuredOutputClient } from "../llm";
import type { OutboundExtractionPayload } from "../privacy/outbound-payload";

export type LocalRawFactExtractionInput = {
  message: string;
};

export interface RawFactExtractor<Input = LocalRawFactExtractionInput> {
  readonly provider: ExtractionProvider;
  readonly model: "gpt-5.6-luna" | null;
  extract(input: Input): Promise<RawFactPatch>;
}

export type LocalRawFactExtractorPort = RawFactExtractor<LocalRawFactExtractionInput>;
export type OpenAIRawFactExtractorPort = RawFactExtractor<OutboundExtractionPayload>;

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
};

function extractArrivalDelayMinutes(text: string): number | undefined {
  const normalized = text.toLowerCase();
  const digitHours = normalized.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|小时)/);
  if (digitHours) return Math.round(Number(digitHours[1]) * 60);
  const wordHours = normalized.match(
    new RegExp(`\\b(${Object.keys(numberWords).join("|")})\\s+hours?\\b`)
  );
  if (wordHours) return numberWords[wordHours[1]] * 60;
  const minutes = normalized.match(/(\d+)\s*(?:minutes?|mins?|分钟)/);
  return minutes ? Number(minutes[1]) : undefined;
}

function explicitOperatingCarrier(message: string): string | undefined {
  const match = message.match(
    /(?:operated by|operating carrier (?:was|is)|actual carrier (?:was|is)|实际承运(?:航司)?(?:是|为)?)\s*([^,.，。;；]+)/i
  );
  if (!match) return undefined;
  return (
    findCanonicalProviderMatch(match[1], "airline")?.provider ?? (match[1].trim() || undefined)
  );
}

function locationPatch(
  parent: "origin" | "destination",
  location: RawClaimFacts["origin"] | undefined
): RawFactPatch["set"] {
  if (!location) return {};
  return {
    ...(location.city !== null ? { [`${parent}.city`]: location.city } : {}),
    ...(location.airport !== null ? { [`${parent}.airport`]: location.airport } : {}),
    ...(location.country !== null ? { [`${parent}.country`]: location.country } : {})
  };
}

function hasExplicitConfirmedHotelReservation(message: string): boolean {
  if (
    /never (?:received|got)(?: a)?(?: booking)? confirmation|no booking confirmation|not (?:a )?confirmed (?:booking|reservation)|(?:booking|reservation) was not confirmed|\bunconfirmed (?:booking|reservation)\b|未收到.*确认|没有收到.*确认|预订未确认|未确认(?:的)?预订/i.test(
      message
    )
  ) {
    return false;
  }
  return /\bconfirmed (?:booking|reservation)\b|(?:booking|reservation) confirmation|received(?: a)?(?: booking)? confirmation|预订已确认|确认预订|收到.*确认/i.test(
    message
  );
}

export class LocalRawFactExtractor implements LocalRawFactExtractorPort {
  readonly provider = "local" as const;

  readonly model = null;

  private readonly classify = classifyInput;

  async extract(input: LocalRawFactExtractionInput): Promise<RawFactPatch> {
    const extracted = this.classify(input.message);
    const route = inferRouteLocationsValue(input.message);
    const set: RawFactPatch["set"] = {};
    if (CANONICAL_INCIDENTS.includes(extracted.issueType as never)) {
      set.incidentType = extracted.issueType as RawClaimFacts["incidentType"];
    } else if (
      /(?:oversold|overbooked|超售)/i.test(input.message) &&
      /(?:did not volunteer|removed me|denied boarding|bumped|拒载|拒绝登机)/i.test(input.message)
    ) {
      set.incidentType = "denied_boarding";
    }
    if (extracted.providerType === "hotel" || extracted.providerType === "airline") {
      set.providerType = extracted.providerType;
    }
    if (extracted.provider) set.provider = extracted.provider;
    const operatingCarrier = explicitOperatingCarrier(input.message);
    if (operatingCarrier) set.operatingCarrier = operatingCarrier;
    Object.assign(set, locationPatch("origin", route.origin));
    Object.assign(set, locationPatch("destination", route.destination));
    if (extracted.disruptionReason && extracted.disruptionReason !== "unknown") {
      set.reasonCategory = extracted.disruptionReason;
    }
    const delayMinutes = extractArrivalDelayMinutes(input.message);
    if (delayMinutes !== undefined) set.finalArrivalDelayMinutes = delayMinutes;
    if (/not overnight|same day|当天/i.test(input.message)) {
      set.isOvernight = false;
    } else if (/overnight|next morning|next day|tomorrow|过夜|第二天/i.test(input.message)) {
      set.isOvernight = true;
    }
    if (extracted.deniedBoardingKind && extracted.deniedBoardingKind !== "unknown") {
      set.deniedBoardingKind = extracted.deniedBoardingKind;
    }
    if (extracted.bookingChannel) set.bookingChannel = extracted.bookingChannel;
    if (extracted.loyaltyStatus) set.loyaltyStatus = extracted.loyaltyStatus;
    if (set.incidentType === "hotel_walk") {
      set.wasWalked = true;
      if (hasExplicitConfirmedHotelReservation(input.message)) {
        set.confirmedHotelReservation = true;
      }
    }
    return { set };
  }
}

const rawFactExtractionInstructions = `Extract only user-observable raw travel-claim facts from the current message.
Return a sparse RawFactPatch matching the supplied schema. Do not return region, carrier-region,
legal-regime, controllability, scenario, or other derived fields. Do not copy prior facts into the
patch unless the current message supplies a new value. null means no new value and never clears an
existing value. Provider and operating carrier are distinct; set operatingCarrier only when the
current message explicitly identifies the actual operating carrier.`;

const rawFactPatchStructuredOutputJsonSchema = {
  ...rawFactPatchJsonSchema,
  properties: {
    set: {
      ...rawFactPatchJsonSchema.properties.set,
      required: [...RAW_FACT_PATHS]
    }
  }
} as const;

export class OpenAIRawFactExtractor implements OpenAIRawFactExtractorPort {
  readonly provider = "openai" as const;

  readonly model = "gpt-5.6-luna" as const;

  private readonly client: StructuredOutputClient;

  constructor(client: StructuredOutputClient) {
    this.client = client;
  }

  async extract(input: OutboundExtractionPayload): Promise<RawFactPatch> {
    const value = await this.client.generate<unknown>({
      schemaName: "raw_fact_patch",
      schema: rawFactPatchStructuredOutputJsonSchema as unknown as Record<string, unknown>,
      instructions: rawFactExtractionInstructions,
      input: JSON.stringify(input),
      maxOutputTokens: INPUT_LIMITS.modelOutputTokens
    });
    const parsed = parseRawFactPatch(value);
    if (!parsed.success) {
      throw new Error(`invalid_raw_fact_patch: ${parsed.errors.join("; ")}`);
    }
    return parsed.data;
  }
}
