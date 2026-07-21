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
export type ApplicabilityStatus = "met" | "unknown" | "not_met";
export type PolicyConditionKind = "scope" | "remedy";
export type PolicyConditionCode =
  | "incident"
  | "route"
  | "provider"
  | "controllability"
  | "arrival_delay"
  | "denied_boarding_kind";

export type PolicyConditionAssessment = {
  code: PolicyConditionCode;
  kind: PolicyConditionKind;
  label: string;
  status: ApplicabilityStatus;
  detail: string;
};

export type PolicyApplicabilityAssessment = {
  policyId: string;
  status: ApplicabilityStatus;
  conditions: PolicyConditionAssessment[];
};

export type EvidenceCoverage = {
  officialBasisStatus: "scope_confirmed" | "conditional" | "not_found";
  officialSourceCount: number;
  reportedCaseCount: number;
  syntheticCaseCount: number;
  unresolvedConditionCount: number;
  unmetRemedyConditionCount: number;
};

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
  booking_channel: "direct" | "ota" | "portal" | "travel_agent" | "corporate_travel" | "unknown";
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
  arrivalDelayMinutes?: number;
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
  arrivalDelayMinutes?: number;
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
  legalRegimes: LegalRegime[];
  officialBasis: Policy[];
  policyAssessments: PolicyApplicabilityAssessment[];
  similarCases: Case[];
  scripts: Script[];
  selectedCase?: Case;
};

export type SuggestedAsks = {
  conservative: string[];
  standard: string[];
  aggressive: string[];
};

export type HandlingContactRole =
  | "hotel_front_desk"
  | "hotel_customer_care"
  | "ticketing_airline"
  | "ticketing_agent"
  | "frequent_flyer_program"
  | "disrupting_airline"
  | "airline_customer_relations"
  | "unknown";

export type HandlingGuidanceSource = {
  sourceType: "industry_guidance" | "community_guide" | "official_policy_required";
  title: string;
  url: string | null;
};

export type HandlingPlaybook = {
  status: "actionable" | "needs_context";
  situation:
    | "hotel_walk"
    | "planned_schedule_change"
    | "close_in_irrops"
    | "completed_disruption"
    | "unknown";
  contactFirst: {
    role: HandlingContactRole;
    name: string | null;
    reason: string;
  };
  askLadder: string[];
  ticketingChecks: string[];
  fallback: string[];
  uncertainties: string[];
  sources: HandlingGuidanceSource[];
  notGuaranteed: true;
};

export type ActionReference = {
  id: string;
  title: string;
  url: string;
  kind: "official" | "community";
  note: string;
};

/**
 * The compact, deterministic product output shown to a traveler.
 * Retrieval records remain available in AnalysisResult for audit/debug views,
 * while the public UI leads with this single action-oriented contract.
 */
export type ActionPlan = {
  status: "actionable" | "needs_context";
  situation: HandlingPlaybook["situation"];
  headline: string;
  contactNow: HandlingPlaybook["contactFirst"];
  primaryAsk: string | null;
  askNext: string[];
  evidenceNow: string[];
  ifTheySayNo: string[];
  uncertainties: string[];
  references: ActionReference[];
  sourceIds: string[];
  providerFeedbackPrompt: string;
  notGuaranteed: true;
};

export type ActionScriptChannel = Extract<
  Script["channel"],
  "front_desk" | "airport_counter" | "phone" | "chat" | "email" | "corporate_escalation"
>;

export type GeneratedActionScript = {
  channel: ActionScriptChannel;
  tone: Script["tone"];
  language: Script["language"];
  text: string;
  sourceIds: string[];
  generatedBy: "llm" | "deterministic";
  disclaimer: string;
};

export type ProviderResponseStatus =
  | "approved"
  | "partial_offer"
  | "denied"
  | "needs_clarification"
  | "no_decision";

export type ProviderFeedbackSignals = {
  responseStatus: ProviderResponseStatus;
  acknowledgedProblem: boolean;
  reason: string | null;
  offer: string | null;
  caseNumber: string | null;
  unanswered: string[];
};

export type ProviderFeedbackResult = {
  summary: string;
  signals: ProviderFeedbackSignals;
  nextAction: ActionPlan;
  extractionMode: "llm" | "deterministic";
  warning?: string;
};

export type AnalysisResult = {
  issueType: IssueType;
  policyRegions: PolicyRegion[];
  legalRegimes: LegalRegime[];
  controllability: Controllability;
  evidenceCoverage: EvidenceCoverage;
  summary: string;
  officialBasis: Policy[];
  policyAssessments: PolicyApplicabilityAssessment[];
  similarCases: Case[];
  suggestedAsks: SuggestedAsks;
  evidenceChecklist: string[];
  scripts: Script[];
  cautions: string[];
  handlingPlaybook?: HandlingPlaybook;
  actionPlan?: ActionPlan;
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
