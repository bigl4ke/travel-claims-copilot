# 数据结构设计

## ClaimFacts

用户自然语言经过多轮 intake 后形成的结构化事实。事件、法律适用和操作阶段必须分开：

- `issueType`: `hotel_walk | airline_delay | airline_cancellation | denied_boarding | unknown`
- `providerType`: `hotel | airline | unknown`
- `provider`: string | null
- `origin`, `destination`: city / airport / country / region
- `disruptionType`, `disruptionReason`, `disruptionReasonStatus`
- `arrivalDelayMinutes`, `isOvernight`, `deniedBoardingKind`
- `bookingChannel`: `direct | ota | portal | travel_agent | corporate_travel | unknown`
- `bookingProvider`: string | null
- `journeyStage`: `pre_trip | at_airport | en_route | completed | unknown`
- `disruptionTiming`: `planned_schedule_change | close_in_irrops | unknown`
- `ticketType`: `cash | award | unknown`
- `validatingCarrier`, `marketingCarrier`, `operatingCarrier`, `disruptingCarrier`
- `awardProgram`: string | null
- `autoRebooked`: boolean | null
- `autoRebookedItinerary`: string | null
- `recoveryPriorities`: (`earliest_arrival | same_date | nonstop | same_airport | same_cabin | preserve_trip_length`)[]
- `preferredAlternatives`: string[]
- `hasConnectionsOrReturnSegments`: boolean | null
- `loyaltyStatus`, `expenses`, `evidence`, `userGoal`, `confidence`

`journeyStage` 表示用户当前处于行程前、机场、途中还是已经结束；`disruptionTiming`
表示应采用提前航变还是临近出发 IRROPS 的处理流程。它们都不是 incident type。

## HandlingPlaybook

由服务器根据 `ClaimFacts` 确定性生成的操作建议，不由 LLM 自由生成：

- `status`: `actionable | needs_context`
- `situation`: `hotel_walk | planned_schedule_change | close_in_irrops | completed_disruption | unknown`
- `contactFirst`: role / name / reason
- `askLadder`: string[]
- `ticketingChecks`: string[]
- `fallback`: string[]
- `uncertainties`: string[]
- `sources`: sourceType / title / url
- `notGuaranteed`: true

`sources.sourceType` 必须区分 `industry_guidance`、`community_guide` 和
`official_policy_required`。操作指南不能替代法规或航司当前官方政策，也不能承诺改签、
报销或补偿。

`HandlingPlaybook` 是内部程序化处理知识。它不会直接作为完整报告展示给用户，而是
与检索结果一起转换为更紧凑的 `ActionPlan`。

## ActionPlan

服务器根据 `ClaimFacts`、`HandlingPlaybook` 和已经检索验证的来源确定性生成：

- `status`: `actionable | needs_context`
- `situation`: 与 `HandlingPlaybook.situation` 相同
- `headline`: 当前行动的一句话摘要
- `contactNow`: role / name / reason
- `primaryAsk`: 当前首要诉求，缺失上下文时为 `null`
- `askNext`: 主要诉求不可行时按顺序提出的备选诉求
- `evidenceNow`: 当前阶段最重要的 3–5 项证据
- `ifTheySayNo`: 第一次请求失败后的确定性路径
- `uncertainties`: 仍会改变权益结论的未知事实
- `references`: `official | community`，每条包含真实 ID、标题、URL 和用途说明
- `sourceIds`: 生成话术时允许引用的官方 policy ID
- `providerFeedbackPrompt`: 邀请用户粘贴对方回复的下一轮提示
- `notGuaranteed`: 固定为 `true`

`ActionPlan` 是公开 UI 的主要输出。完整 `Policy`、`Case`、适用性条件和检索排名仍保留
在 `AnalysisResult`，但只用于审计、测试或显式展开的参考信息。

## GeneratedActionScript

用户明确选择沟通渠道后按需生成：

- `channel`: `front_desk | airport_counter | phone | chat | email | corporate_escalation`
- `tone`: `polite | polite_firm | firm`
- `language`: `en | zh`
- `text`: 可复制话术
- `sourceIds`: 必须是当前 `ActionPlan.sourceIds` 的子集
- `generatedBy`: `llm | deterministic`
- `disclaimer`: 不保证结果的简洁提示

LLM 只能调整表达，不得改变 `contactNow`、诉求顺序、引用来源或引入未确认事实、金额
和权益。模型调用失败时使用确定性模板。

## ProviderFeedbackResult

用户粘贴酒店或航司回复后生成：

- `summary`: 对方回复的简洁事实性摘要
- `signals.responseStatus`: `approved | partial_offer | denied | needs_clarification | no_decision`
- `signals.acknowledgedProblem`: boolean
- `signals.reason`, `signals.offer`, `signals.caseNumber`: string | null
- `signals.unanswered`: string[]
- `nextAction`: 根据这些信号确定性生成的新 `ActionPlan`
- `extractionMode`: `llm | deterministic`
- `warning`: 模型失败或信号置信不足时的可选提示

LLM 只提取 provider response 信号；是否接受、追问、升级或结束由规则系统决定。

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
- booking_channel: "direct" | "ota" | "portal" | "travel_agent" | "corporate_travel" | "unknown"
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
