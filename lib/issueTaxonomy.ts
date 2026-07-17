import type { IssueType, MvpIssueType } from "./types";

export const MVP_ISSUE_TYPES = [
  "hotel_walk",
  "controllable_airline_delay",
  "controllable_airline_cancellation",
  "denied_boarding",
  "eu261_delay_or_cancellation"
] as const satisfies readonly MvpIssueType[];

const mvpIssueTypeSet = new Set<IssueType>(MVP_ISSUE_TYPES);

export const issueLabels: Record<IssueType, string> = {
  hotel_walk: "Hotel walk",
  controllable_airline_cancellation: "Controllable airline cancellation",
  controllable_airline_delay: "Controllable airline delay",
  eu261_delay_or_cancellation: "EU261 delay or cancellation",
  denied_boarding: "Denied boarding or voluntary bump",
  baggage_delay: "Baggage delay",
  airline_delay_trip_insurance: "Airline delay and trip insurance",
  airline_baggage_not_checked: "Baggage not accepted at check-in",
  airline_rebooking_mixed_carrier_delay: "Mixed-carrier rebooking delay",
  hotel_billing_dispute: "Hotel billing dispute",
  hotel_service_issue: "Hotel service issue",
  hotel_property_loss: "Hotel property loss",
  hotel_relocation_before_opening: "Hotel relocation before opening",
  hotel_room_feature_mismatch: "Hotel room feature mismatch",
  hotel_elite_benefit_closure: "Hotel elite benefit closure",
  unknown: "Needs more detail"
};

const issueAliases: Partial<Record<IssueType, IssueType[]>> = {
  hotel_walk: ["hotel_walk"],
  controllable_airline_cancellation: [
    "controllable_airline_cancellation",
    "controllable_airline_delay"
  ],
  controllable_airline_delay: [
    "controllable_airline_delay",
    "controllable_airline_cancellation"
  ],
  baggage_delay: ["baggage_delay", "airline_baggage_not_checked"],
  eu261_delay_or_cancellation: ["eu261_delay_or_cancellation"],
  denied_boarding: ["denied_boarding"],
  unknown: []
};

export function normalizeIssueType(value: unknown): IssueType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value in issueLabels ? (value as IssueType) : undefined;
}

export function getIssueAliases(issueType: IssueType): IssueType[] {
  return issueAliases[issueType] ?? [issueType];
}

export function isMvpIssueType(issueType: IssueType): issueType is MvpIssueType {
  return mvpIssueTypeSet.has(issueType);
}
