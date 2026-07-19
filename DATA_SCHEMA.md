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
An umbrella `US_AIRLINE_COMMITMENT` policy is regulator context only and therefore has an empty
`compensation_or_rights` array; carrier care is represented only by an exact `CarrierCommitment`.

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
- source_ids: string[] (required; 1..8 unique IDs from the same snapshot's `Policy.policy_id`
  namespace only)
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

`source_ids` is the canonical policy citation field. Case, script, and carrier-commitment IDs are
not accepted, and all four identifier namespaces must be pairwise disjoint. The validator resolves
citations after parsing the complete snapshot; it never guesses or synthesizes missing citations.

## CarrierCommitment

Carrier-specific, human-reviewed care commitments are separate from umbrella regulator context.
Production JSON uses snake case and is converted once at the knowledge boundary.

- commitment_id: string
- normalized_carrier: exact canonical provider-registry name
- applicable_carrier_role: `operating_carrier`
- source_title: string
- source_provider: string
- source_url: HTTPS URL
- source_type: `official_dashboard` or `official_policy`
- legal_regime: `US_AIRLINE_COMMITMENT`
- authority: `medium`
- last_checked: strict `YYYY-MM-DD`
- reviewer_note: string
- remedies: array of typed remedy records

Each remedy has `remedy_id`, `committed`, typed `predicates`, `display_conditions`, and `rights`.
Allowed remedy IDs are `us_rerouting`, `us_meal`, `us_hotel`, and `us_ground_transport`.
Predicates are closed event, controllability, minimum-wait, or overnight objects; display copy never
determines eligibility. A committed remedy requires event and controllability predicates.

Predicate evaluation is tri-state: `matched`, `missing`, or `excluded`. Missing facts can yield only
`conditional`; an excluded predicate makes the remedy unavailable; `supported` requires every
predicate to match, a committed remedy, an exact normalized-carrier match, the operating-carrier
role, and a record no more than 30 days old. Because the current frozen fact contract has no
provenance-bearing wait duration, a minimum-wait predicate is always `missing`; final-arrival delay
is never substituted.

## KnowledgeSnapshot

The runtime snapshot contains deep-frozen policies, cases, scripts, carrier commitments, and a
`version`. The version is the SHA-256 digest of canonical validated content: object keys are sorted,
array order is preserved, and script citations are included. Each repository load returns independent
arrays and records. Invalid, stale, future-dated, ambiguous, or unresolved content rejects the whole
snapshot rather than being silently dropped.

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
