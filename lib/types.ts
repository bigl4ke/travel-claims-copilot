export type IssueType =
  | "hotel_walk"
  | "airline_cancellation"
  | "airline_delay"
  | "denied_boarding"
  | "baggage_delay"
  | "airline_delay_trip_insurance"
  | "airline_baggage_not_checked"
  | "airline_rebooking_mixed_carrier_delay"
  | "hotel_billing_dispute"
  | "hotel_service_issue"
  | "hotel_property_loss"
  | "hotel_relocation_before_opening"
  | "hotel_room_feature_mismatch"
  | "hotel_elite_benefit_closure"
  | "unknown";

export type MvpIssueType = Extract<
  IssueType,
  "hotel_walk" | "airline_cancellation" | "airline_delay" | "denied_boarding"
>;

export type ProviderType = "hotel" | "airline" | "credit_card" | "ota" | "government";
export type PolicyRegion = "EU_EEA_CH" | "UK" | "US" | "CA" | "AU" | "CN" | "other" | "global";
export type PolicyRouteRegion = Exclude<PolicyRegion, "global">;
export type LegalRegime =
  | "provider_policy"
  | "EU261"
  | "UK261"
  | "US_DOT_REFUND"
  | "US_DOT_DENIED_BOARDING"
  | "US_AIRLINE_COMMITMENT"
  | "CA_APPR"
  | "AU_ACL"
  | "CN_FLIGHT_REGULATION";
export type PolicyApplicabilityRule =
  | "any_route"
  | "listed_provider"
  | "origin_region"
  | "origin_or_destination_region"
  | "eu261_route"
  | "uk261_route"
  | "australia_consumer_law"
  | "china_flight_regulation";
export type Controllability = "controllable" | "uncontrollable" | "unknown";
export type PolicyControllability = Controllability | "any";

export type Policy = {
  policy_id: string;
  provider_type: ProviderType;
  provider: string;
  policy_name: string;
  legal_regime: LegalRegime;
  applicability_rule: PolicyApplicabilityRule;
  incident_types: MvpIssueType[];
  applicable_regions: PolicyRegion[];
  applicable_providers: string[];
  required_controllability: PolicyControllability;
  source_url: string;
  source_type:
    | "official_policy"
    | "government_regulation"
    | "regulator_guidance"
    | "official_dashboard"
    | "terms";
  authority_level: "high" | "medium" | "low";
  applicable_conditions: string[];
  compensation_or_rights: string[];
  summary: string;
  last_checked: string;
};

export type Case = {
  case_id: string;
  source_type: "community_dp" | "user_submitted" | "synthetic_example";
  source_name: string;
  source_url: string;
  provider_type: Exclude<ProviderType, "government">;
  provider: string;
  brand_or_airline: string;
  issue_type: string;
  location_country: string;
  booking_channel: "direct" | "ota" | "portal" | "unknown";
  loyalty_status: string;
  reservation_type: "paid" | "points" | "award" | "unknown";
  facts: string;
  requested_compensation: string[];
  actual_outcome: string;
  evidence_used: string[];
  escalation_path: string[];
  reusable_lesson: string;
  confidence: "high" | "medium" | "low";
  notes: string;
  review_status: "approved" | "needs_review" | "excluded";
  review_notes: string[];
};

export type Script = {
  script_id: string;
  source_ids: string[];
  incident_types: MvpIssueType[];
  applicable_regions: PolicyRegion[];
  applicability_rule: PolicyApplicabilityRule;
  required_controllability: PolicyControllability;
  provider: string;
  channel:
    | "front_desk"
    | "airport_counter"
    | "phone"
    | "chat"
    | "email"
    | "corporate_escalation"
    | "regulator_complaint";
  tone: "polite" | "polite_firm" | "firm";
  language: "en" | "zh";
  template: string;
  when_to_use: string;
};

export type AnalyzeOptions = {
  caseId?: string;
  issueType?: IssueType;
};

export type ExtractedFacts = {
  description: string;
  issueType: IssueType;
  provider?: string;
  providerType?: ProviderType;
  country?: string;
  bookingChannel?: Case["booking_channel"];
  loyaltyStatus?: string;
  disruptionReason?:
    | "crew"
    | "mechanical"
    | "oversales"
    | "weather"
    | "late_inbound_aircraft"
    | "other_controllable"
    | "unknown";
  isOvernight?: boolean;
  deniedBoardingKind?: "voluntary" | "involuntary" | "unknown";
  operatingCarrier?: string;
  operatingCarrierRegion?: PolicyRouteRegion;
  originRegion?: PolicyRouteRegion;
  destinationRegion?: PolicyRouteRegion;
  policyRegions?: PolicyRegion[];
  controllability?: Controllability;
  caseId?: string;
  confidence: "low" | "medium" | "high";
  signals: string[];
  source: "keyword" | "selected_case" | "selected_issue" | "fallback" | "llm";
};

export type RetrievalQuery = {
  description: string;
  issueType: IssueType;
  provider?: string;
  providerType?: ProviderType;
  country?: string;
  bookingChannel?: Case["booking_channel"];
  loyaltyStatus?: string;
  disruptionReason?: ExtractedFacts["disruptionReason"];
  isOvernight?: boolean;
  deniedBoardingKind?: ExtractedFacts["deniedBoardingKind"];
  operatingCarrier?: string;
  operatingCarrierRegion?: PolicyRouteRegion;
  originRegion?: PolicyRouteRegion;
  destinationRegion?: PolicyRouteRegion;
  policyRegions: PolicyRegion[];
  controllability: Controllability;
};

export type RetrievalMatchReason =
  | "exact_issue_match"
  | "issue_alias_match"
  | "provider_exact_match"
  | "provider_partial_match"
  | "generic_provider_match"
  | "provider_type_match"
  | "country_match"
  | "booking_channel_match"
  | "loyalty_status_match"
  | "disruption_reason_match"
  | "denied_boarding_kind_match"
  | "description_overlap"
  | "jurisdiction_match"
  | "provider_scope_match"
  | "controllability_match"
  | "authority_match"
  | "confidence_match";

export type ScoredRetrievalItem<T> = {
  item: T;
  score: number;
  reasons: RetrievalMatchReason[];
};

export type RetrievalLimits = {
  policyLimit?: number;
  caseLimit?: number;
  scriptLimit?: number;
};

export type RetrievalResult = {
  facts: ExtractedFacts;
  query: RetrievalQuery;
  issueAliases: string[];
  officialBasis: Policy[];
  similarCases: Case[];
  scripts: Script[];
  selectedCase?: Case;
};

export type SuggestedAsks = {
  conservative: string[];
  standard: string[];
  aggressive: string[];
};

export type AnalysisResult = {
  issueType: IssueType;
  policyRegions: PolicyRegion[];
  legalRegimes: LegalRegime[];
  controllability: Controllability;
  strength: "low" | "medium" | "high";
  summary: string;
  officialBasis: Policy[];
  similarCases: Case[];
  suggestedAsks: SuggestedAsks;
  evidenceChecklist: string[];
  scripts: Script[];
  cautions: string[];
};

export type ScenarioSummary = {
  issueType: IssueType;
  label: string;
  caseCount: number;
  officialBasisCount: number;
  scriptCount: number;
  providers: string[];
  sampleCase?: {
    caseId: string;
    provider: string;
    brandOrAirline: string;
    facts: string;
  };
};
