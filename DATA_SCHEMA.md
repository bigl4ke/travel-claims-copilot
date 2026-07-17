# 数据结构设计

## Policy

官方政策、法规、航司/酒店公开承诺。

字段：

- policy_id: string
- provider_type: "hotel" | "airline" | "credit_card" | "ota" | "government"
- provider: string
- policy_name: string
- legal_regime: "provider_policy" | "EU261" | "UK261" | "US_DOT_REFUND" | "US_DOT_DENIED_BOARDING" | "US_AIRLINE_COMMITMENT" | "CA_APPR" | "AU_ACL" | "CN_FLIGHT_REGULATION"
- applicability_rule: "any_route" | "listed_provider" | "origin_region" | "origin_or_destination_region" | "eu261_route" | "uk261_route" | "australia_consumer_law" | "china_flight_regulation"
- incident_types: ("hotel_walk" | "airline_delay" | "airline_cancellation" | "denied_boarding")[]
- applicable_regions: ("EU_EEA_CH" | "UK" | "US" | "CA" | "AU" | "CN" | "other" | "global")[]
- applicable_providers: string[]
- required_controllability: "controllable" | "uncontrollable" | "unknown" | "any"
- source_url: string
- source_type: "official_policy" | "government_regulation" | "regulator_guidance" | "official_dashboard" | "terms"
- authority_level: "high" | "medium" | "low"
- applicable_conditions: string[]
- compensation_or_rights: string[]
- summary: string
- last_checked: string

`applicable_regions` records geography, while `legal_regime` identifies the legal or policy
framework. `applicability_rule` is evaluated deterministically against route direction and,
where required, the operating carrier. It must not be inferred solely from the incident type.

## Case

社区案例、用户 DP、历史反馈案例。

字段：

- case_id: string
- source_type: "community_dp" | "user_submitted" | "synthetic_example"
- source_name: string
- source_url: string
- provider_type: "hotel" | "airline" | "credit_card" | "ota"
- provider: string
- brand_or_airline: string
- issue_type: string
- location_country: string
- booking_channel: "direct" | "ota" | "portal" | "unknown"
- loyalty_status: string
- reservation_type: "paid" | "points" | "award" | "unknown"
- facts: string
- requested_compensation: string[]
- actual_outcome: string
- evidence_used: string[]
- escalation_path: string[]
- reusable_lesson: string
- confidence: "high" | "medium" | "low"
- notes: string
- review_status: "approved" | "needs_review" | "excluded"
- review_notes: string[]

`review_status` controls product retrieval. Only `approved` cases may appear as similar cases. Records marked `needs_review` or `excluded` remain in the consolidated file for provenance and future cleanup, but must not be presented to users.

`issue_type` describes the incident itself. Legal regimes such as EU261 must not be stored as a case issue type.

## Script

沟通话术模板。

字段：

- script_id: string
- incident_types: ("hotel_walk" | "airline_delay" | "airline_cancellation" | "denied_boarding")[]
- applicable_regions: ("EU_EEA_CH" | "UK" | "US" | "CA" | "AU" | "CN" | "other" | "global")[]
- applicability_rule: same deterministic route rule vocabulary as `Policy`
- required_controllability: "controllable" | "uncontrollable" | "unknown" | "any"
- provider: string
- channel: "front_desk" | "airport_counter" | "phone" | "chat" | "email" | "corporate_escalation" | "regulator_complaint"
- tone: "polite" | "polite_firm" | "firm"
- language: "en" | "zh"
- template: string
- when_to_use: string

## Outcome

未来用户回填结果。

字段：

- outcome_id: string
- user_case_summary: string
- incident_type: string
- policy_regions: ("EU_EEA_CH" | "UK" | "US" | "CA" | "AU" | "CN" | "other")[]
- provider: string
- suggested_ask: string[]
- actual_result: string
- communication_rounds: number
- successful_script_id: string
- user_rating: "useful" | "not_useful" | "unclear"
- notes: string
