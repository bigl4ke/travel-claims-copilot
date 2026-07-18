import {
  type AssistanceFacts,
  type ClaimState,
  type RawClaimFacts,
  type RawLocation,
  type ResolvedClaimContext
} from "../../lib/domain/claim-contract";
import { resolveClaimContext } from "../../lib/domain/context-resolver";

export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [Key in keyof T]?: DeepPartial<T[Key]> }
    : T;

const emptyLocation = (): RawLocation => ({ city: null, airport: null, country: null });

const emptyAssistance = (): AssistanceFacts => ({
  refundOffered: null,
  refundAccepted: null,
  creditOffered: null,
  creditAccepted: null,
  reroutingOffered: null,
  reroutingAccepted: null,
  replacementTravelOffered: null,
  replacementTravelAccepted: null,
  lodgingOffered: null,
  lodgingAccepted: null,
  mealsOffered: null,
  mealsAccepted: null,
  groundTransportOffered: null,
  groundTransportAccepted: null
});

export function rawFacts(overrides: DeepPartial<RawClaimFacts> = {}): RawClaimFacts {
  return {
    incidentType: null,
    providerType: null,
    provider: null,
    brandOrProperty: null,
    operatingCarrier: null,
    statedReason: null,
    reasonCategory: null,
    userInitiatedChange: null,
    scheduledFinalArrival: null,
    actualFinalArrival: null,
    finalArrivalDelayMinutes: null,
    isOvernight: null,
    cancellationNoticeHours: null,
    deniedBoardingKind: null,
    oversalesConfirmed: null,
    confirmedReservation: null,
    checkedInOnTime: null,
    atGateOnTime: null,
    documentsCompliant: null,
    replacementArrivalDelayMinutes: null,
    confirmedHotelReservation: null,
    qualifyingHotelReservation: null,
    bookingChannel: null,
    loyaltyStatus: null,
    membershipAttached: null,
    wasWalked: null,
    replacementLodgingProvided: null,
    userGoal: null,
    ...overrides,
    origin: { ...emptyLocation(), ...overrides.origin },
    destination: { ...emptyLocation(), ...overrides.destination },
    assistance: { ...emptyAssistance(), ...overrides.assistance },
    expenses: [...(overrides.expenses ?? [])],
    evidence: [...(overrides.evidence ?? [])]
  };
}

export function claimState(
  factOverrides: DeepPartial<RawClaimFacts> = {},
  revision = 0,
  stateOverrides: Partial<Omit<ClaimState, "facts" | "revision">> = {}
): ClaimState {
  return {
    facts: rawFacts(factOverrides),
    provenance: structuredClone(stateOverrides.provenance ?? {}),
    revision,
    conflicts: structuredClone(stateOverrides.conflicts ?? []),
    unresolvedFields: [...(stateOverrides.unresolvedFields ?? [])]
  };
}

export function resolvedContext(overrides: DeepPartial<RawClaimFacts> = {}): ResolvedClaimContext {
  return resolveClaimContext({ state: claimState(overrides) });
}
