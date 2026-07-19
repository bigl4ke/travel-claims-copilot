import type {
  CanonicalIncident,
  ClaimState,
  RawClaimFacts,
  RawFactPath,
  RawLocation
} from "../domain/claim-contract";
import { RAW_FACT_PATHS } from "../domain/claim-contract";
import { buildResolutionFacts } from "../domain/raw-fact-schema";
import { redactNarrative } from "./redaction";

export type OutboundExtractionPayload = {
  message: string;
  prior: {
    incidentType: CanonicalIncident | null;
    provider: string | null;
    operatingCarrier: string | null;
    origin: Pick<RawLocation, "city" | "airport" | "country">;
    destination: Pick<RawLocation, "city" | "airport" | "country">;
    reasonCategory: RawClaimFacts["reasonCategory"];
    finalArrivalDelayMinutes: number | null;
    deniedBoardingKind: RawClaimFacts["deniedBoardingKind"];
  };
  unresolvedFields: RawFactPath[];
};

const outboundPriorPaths: ReadonlySet<RawFactPath> = new Set([
  "incidentType",
  "provider",
  "operatingCarrier",
  "origin.city",
  "origin.airport",
  "origin.country",
  "destination.city",
  "destination.airport",
  "destination.country",
  "reasonCategory",
  "finalArrivalDelayMinutes",
  "deniedBoardingKind"
]);

export function buildOutboundExtractionInput(input: {
  message: string;
  claimState: ClaimState;
}): OutboundExtractionPayload {
  const facts = buildResolutionFacts(input.claimState);
  const unresolved = new Set(input.claimState.unresolvedFields);
  return {
    message: redactNarrative(input.message),
    prior: {
      incidentType: facts.incidentType,
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
      reasonCategory: facts.reasonCategory,
      finalArrivalDelayMinutes: facts.finalArrivalDelayMinutes,
      deniedBoardingKind: facts.deniedBoardingKind
    },
    unresolvedFields: RAW_FACT_PATHS.filter(
      (path) => outboundPriorPaths.has(path) && unresolved.has(path)
    )
  };
}
