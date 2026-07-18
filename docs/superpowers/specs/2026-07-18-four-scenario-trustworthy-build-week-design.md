# Four-Scenario Trustworthy Build Week Design

- Date: 2026-07-18
- Status: Approved design; pending committed-spec review
- Target event: OpenAI Build Week
- Target category: Apps for Your Life
- Repository baseline: `992c173`
- Pre-hackathon baseline: `66082e4`

## 1. Executive Decision

Travel Claims Copilot will ship as a trustworthy, maintainable vertical slice for four travel-disruption journeys. The competition version will keep the existing Next.js, TypeScript, local JSON, deterministic retrieval, and deterministic response-generation foundation. It will add explicit domain boundaries, source transparency, safety controls, representative evaluation, CI, and a judge-ready deployment.

GPT-5.6 Luna is the only default and primary demonstration model. It acts as a structured fact extractor, not as the policy or eligibility engine. The DeepSeek adapter remains as dormant compatibility code and is excluded from the primary UI, evaluation results, README narrative, demo video, and Devpost description.

The selected implementation strategy is **freeze and harden**. The team will not introduce a database, vector store, login, payment, autonomous multi-agent runtime, automated claim submission, or persistent storage of raw user narratives before the competition submission.

### 1.1 Alternatives Considered

- **Patch the current demo in place:** fastest initially, but rejected because it leaves duplicated domain rules, fact loss, and ambiguous eligibility semantics in the public path.
- **Freeze and harden the four journeys:** selected because it preserves the working repository while creating explicit trust boundaries, testable contracts, and credible competition evidence.
- **Rewrite as a generalized claims platform:** rejected for the competition because database, vector-search, authentication, and multi-jurisdiction expansion would increase delivery risk without strengthening the four core demonstrations.

## 2. Context and Evidence

The current repository already contains:

- a Next.js 15 and React 19 web application;
- multi-turn structured intake;
- an OpenAI Responses API adapter using strict JSON Schema and `store: false`;
- a deterministic extraction fallback;
- route, carrier, controllability, policy-scope, and retrieval logic;
- 11 policies, 55 reviewed cases, and 14 scripts;
- 5 test files with 50 static test declarations;
- golden scenarios for hotel walk, US airline disruption, denied boarding, and EU-region disruption.

Data validation currently succeeds for 11 policies, 55 cases (35 approved, 13 needing review, and 7 excluded), and 14 scripts. A clean dependency installation, full test run, typecheck, lint, production build, browser test, live GPT-5.6 evaluation, and production deployment have not yet been verified.

The repository predates the hackathon. The README and submission materials must distinguish work before `66082e4` from work added during the submission period. The current Devpost project is a pre-draft named `Untitled`; it is not a final submission.

The submission and edit deadline is 2026-07-21 at 17:00 Pacific Time, which is 2026-07-22 at 08:00 in Shanghai. All release, evidence, video, and human-review gates must be scheduled backward from that deadline.

## 3. Goals

1. Deliver four complete and trustworthy user journeys.
2. Ensure every user-visible assessment is based on facts that actually reached the assessment engine.
3. Make jurisdiction, carrier region, controllability, policy applicability, and remedy status server-owned derived data.
4. Separate policy applicability from relevance ranking.
5. Clearly distinguish government regulation, regulatory guidance, provider commitment, community reports, user-submitted reports, and synthetic examples.
6. Give users a fact-review and correction path before final analysis.
7. Capture privacy-safe result feedback without automatically changing the approved knowledge base.
8. Stop deterministically recognizable high-risk and out-of-scope requests before any external call, and prevent every high-risk request from receiving normal analysis.
9. Protect the public GPT path from accidental cost, denial-of-service, and privacy failures.
10. Produce reproducible unit, contract, browser, build, deployment, and live-model evidence.
11. Satisfy the documented OpenAI Build Week requirements for Codex, GPT-5.6, README evidence, repository access, video, `/feedback`, and final submission.

## 4. Non-Goals

The competition version will not add:

- a database or Supabase migration;
- embeddings or vector search;
- user accounts or payment;
- automated email, negotiation, claim filing, or legal representation;
- scraping;
- persistent raw conversations or outcome data;
- a mobile application;
- an autonomous multi-agent product runtime;
- full product localization;
- public support for additional incident types or jurisdictions.

Canada, Australia, China, baggage, insurance, billing, property-loss, and other existing data may remain in the repository as dormant or experimental data. They must not enter the public normal-analysis path or the primary competition demonstration.

## 5. Frozen User Journeys

The public product supports exactly four narrative journeys:

1. **Marriott hotel walk**
   - A confirmed reservation is not honored because of overselling or unavailability.
   - Membership status, booking channel, qualifying reservation, and actual walk facts are material.
2. **US airline delay or cancellation**
   - The primary demonstration uses a controllable disruption, but controllability is evaluated rather than assumed by the journey name.
   - Controllable care commitments and reason-independent refund or rerouting rights are evaluated separately.
   - A DOT Dashboard meal, hotel, or transport commitment applies only when a current source record matches the carrier role required by that source, normally the normalized operating carrier.
   - Crew and mechanical disruptions differ from weather and user-initiated changes.
3. **US voluntary or involuntary denied boarding**
   - Voluntary negotiation is not presented as involuntary denied-boarding compensation.
   - Check-in compliance, boarding status, and alternative-arrival timing may be material.
4. **EU261 or UK261 delay or cancellation**
   - Route direction, operating carrier, final-arrival delay, cancellation timing, and available evidence are material.

The server derives an ordered set of stable `ScenarioId` values. Canonical raw incident types do not encode controllability or a legal regime:

| `ScenarioId` | Canonical raw incident | Admission rule |
|---|---|---|
| `marriott_hotel_walk` | `hotel_walk` | The normalized provider is in the Marriott portfolio and the user reports a confirmed reservation was not honored |
| `us_airline_disruption` | `airline_delay` or `airline_cancellation` | The authoritative route is to, from, or within the US; controllability changes remedies, not scenario admission |
| `us_denied_boarding` | `denied_boarding` | Departure is from the US; voluntary status and compensation prerequisites remain assessment conditions |
| `eu_uk_air_disruption` | `airline_delay` or `airline_cancellation` | The authoritative route and operating carrier satisfy the deterministic EU261 or UK261 scope rules |

Existing identifiers `controllable_airline_delay`, `controllable_airline_cancellation`, and `eu261_delay_or_cancellation` are legacy input aliases only. The first two map to canonical delay or cancellation without asserting controllability. The EU261 alias does not activate a regime by itself and returns `needs_information` when the actual incident subtype or route facts remain ambiguous.

Hotel and air scenarios are mutually exclusive. Denied boarding is distinct from delay or cancellation in the frozen scope. A delay or cancellation may activate both `us_airline_disruption` and `eu_uk_air_disruption`; every active evaluator runs, and their policies and remedies are combined without deduplication by display rank. For presentation only, `eu_uk_air_disruption` precedes `us_airline_disruption` as `primaryScenario` when both are active. No eligibility decision may depend on that presentation order.

If facts are insufficient to determine whether a frozen scenario applies, the workflow returns `needs_information`. It returns `out_of_scope` only after known facts rule out all frozen scenarios. High-risk inputs return `unsupported_high_risk`. Neither out-of-scope nor high-risk inputs receive ordinary asks, scripts, or compensation-style analysis.

## 6. Chosen Architecture

```text
User message
  -> deterministic scope and high-risk preflight
  -> GPT-5.6 Luna RawFactPatch extraction, or Local fallback
  -> server merge and raw-fact validation
  -> authoritative jurisdiction, carrier-region, and controllability resolution
  -> active frozen-scenario set resolution and condition evaluation
  -> policy and remedy assessment
  -> independent case and script relevance ranking
  -> source-aware AnalysisViewModel
  -> fact review, result, sources, evidence, scripts, and next actions
```

### 6.1 Boundary Rules

- The LLM may extract only user-observable raw facts.
- The client and LLM cannot authoritatively set `region`, `operatingCarrierRegion`, `legalRegime`, or `controllability`.
- The client and LLM cannot authoritatively select a `ScenarioId`; scenarios are derived from canonical incidents and server-owned route facts.
- Server resolution overwrites or ignores conflicting derived values from external input.
- Policy applicability is evaluated before and independently from Top-K ranking.
- Display limits cannot change the set of applicable legal regimes or remedies.
- Provider commitments never inherit from a regulator dashboard globally. A commitment can be `supported` only when the source record names the normalized applicable carrier, is within the release freshness gate, and its event conditions match. An unknown carrier or missing carrier-specific record remains `conditional` or `needs_information`, never `supported`.
- Synthetic cases may be shown only with an explicit synthetic label and must not be presented as community outcomes.
- A real comparable case outranks a synthetic case when both are eligible for the same result slot.
- OpenAI model metadata may be displayed; API keys, base URLs, access codes, and private response details may not be displayed.
- The competition build and public routes do not expose a DeepSeek selector or activate the DeepSeek adapter. Compatibility code may remain covered by isolated tests, but it cannot appear in primary runtime behavior or competition evidence.
- Every result is presented as informational guidance, not legal advice or a promise of compensation; uncertainty and material missing conditions remain visible.

### 6.2 Extension Interfaces

The design preserves future extension through small interfaces:

- `StructuredOutputClient`
- `JurisdictionResolver`
- `ScenarioEvaluator`
- `KnowledgeRepository`
- `RateLimiter`
- `FeedbackSink`

The competition implementation uses the OpenAI Responses adapter, deterministic fallback, local JSON repository, and four evaluators. A globally effective deployment-layer or adapter-based limiter protects GPT access; any memory-backed limiter is supplemental only. Future adapters must not change the public assessment contract.

## 7. Data Contracts

### 7.1 RawClaimFacts

`RawClaimFacts` contains only user-observable facts:

- provider, brand or property, and operating carrier;
- origin and destination airport, city, and country;
- canonical disruption type, stated reason, and whether the user initiated a change;
- scheduled and actual final-arrival facts, final arrival-delay minutes, overnight status, and cancellation-notice timing;
- whether refund, credit, rerouting, replacement travel, lodging, meals, or transport were offered or accepted;
- voluntary or involuntary denied-boarding status, oversales confirmation, timely check-in and gate compliance, boarding-document compliance, and replacement-arrival timing;
- confirmed and qualifying hotel reservation status, booking channel, loyalty status, whether membership was attached to the reservation, actual walk status, and replacement lodging;
- expenses and evidence already held, using bounded descriptions rather than account or document numbers;
- the user's requested outcome.

It does not contain trusted region, legal-regime, or controllability values.

Internally, each raw value carries field-level provenance: `user_correction`, `user_message`, `deterministic_extraction`, or `openai_extraction`, plus the client fact revision at which it was observed. Provenance describes how a value entered the state; it does not make a user-provided fact independently verified.

### 7.2 RawFactPatch and Merge Semantics

The LLM returns an allowlisted `RawFactPatch`, never a complete authoritative claim and never a derived field. A model patch has `set` values; `null` means “no new value” and cannot silently clear prior state. The fact-review UI may also send an explicit `clear` list.

Merge rules are deterministic:

1. an explicit fact-review correction or clear operation wins for that client revision;
2. an unambiguous current user statement wins over prior state;
3. agreeing deterministic and OpenAI candidates update prior state;
4. conflicting current-turn candidates are marked unresolved and trigger `needs_information` instead of silently choosing one;
5. untouched fields retain their previous values;
6. every accepted edit recomputes all derived context and assessments from scratch.

The client increments `factsRevision` after an accepted edit, aborts superseded requests when possible, and ignores a response whose echoed base revision no longer matches current state. The server remains stateless: every response is a pure result of the supplied prior facts, explicit correction, current message, and base revision. This prevents an older asynchronous response from restoring stale route or boarding facts without adding persistent conversation storage.

### 7.3 ResolvedClaimContext

`ResolvedClaimContext` is produced by the server and contains:

- normalized provider and carrier identities;
- authoritative origin and destination regions;
- authoritative operating-carrier region;
- controllability classification and provenance;
- ordered active `scenarioIds` and a presentation-only `primaryScenario`;
- field-level raw-fact provenance;
- source and confidence for every derived value;
- unresolved and conflicting facts.

### 7.4 AssessmentResult

The top-level workflow status is one of:

- `ready`
- `needs_information`
- `out_of_scope`
- `unsupported_high_risk`

Each remedy or right has one of:

- `supported`
- `conditional`
- `not_applicable`

Each assessment includes:

- facts used;
- matched conditions;
- missing conditions;
- explicit exclusions;
- supporting policy/source IDs;
- the normalized carrier and source freshness used for any provider-commitment assessment;
- evidence completeness;
- conservative, standard, and assertive request options that are each linked to a remedy status and never presented as guaranteed;
- cautions and a recommended next action.

The top-level status is `needs_information` when scenario selection is unresolved or every material remedy is blocked by a required missing fact. It is `ready` when the active scenario set is resolved and at least one material remedy can be assessed as `supported`, `conditional`, or `not_applicable`; missing non-blocking facts remain visible. High-risk and out-of-scope statuses take precedence over both.

The user-facing product does not use one ambiguous `claim strength` field as a proxy for legal eligibility, evidence completeness, retrieval confidence, and success probability.

### 7.5 Analysis View Model

The response presented to the UI contains:

```ts
{
  status;
  primaryScenario;
  scenarioIds;
  factsRevision;
  factsUsed;
  missingFacts;
  extraction: {
    requestedMode: "gpt" | "local";
    provider: "openai" | "local";
    model: "gpt-5.6-luna" | null;
    fallbackReason?: string;
  };
  assessments;
  officialSources;
  providerCommitments;
  similarCases;
  scripts;
  evidenceStatus;
  nextActions;
  cautions;
}
```

Policy cards preserve source type, authority, applicable conditions, last-checked date, and original URL. Case cards preserve source type, source name, source URL, review status, review notes, synthetic status, and outcome completeness.

Retrieval reasons remain available to the presentation mapper. Raw internal score values are not shown unless they convey a user-understandable meaning.

## 8. Error, Privacy, and Cost Contract

### 8.1 Input Limits

- Maximum request body: 32 KB.
- Maximum user message: 4,000 Unicode characters.
- Maximum ordinary string field: 256 characters.
- Maximum `userGoal`: 500 characters.
- Maximum evidence items: 20.
- Maximum expense items: 20.
- Maximum evidence or expense item length: 256 characters.
- Maximum OpenAI output: 1,200 tokens.

An oversized request is rejected before a model call.
The body reader enforces the actual byte limit while reading and does not trust `Content-Length` alone.

### 8.2 Extraction Mode and Provider Selection

The request contract accepts `requestedMode: "local" | "gpt"`; absence defaults to `local`. Selection is server-controlled:

- `local` never calls an external model and does not require a demo access code;
- `gpt` requires privacy acknowledgement and a valid demo access code before any model call;
- a missing or invalid code returns 401 and never silently upgrades a Local request or calls GPT;
- a valid GPT request uses only the OpenAI Responses adapter with `gpt-5.6-luna` in the competition runtime;
- a missing OpenAI key or an eligible upstream failure produces the documented Local fallback and badge;
- DeepSeek environment variables cannot activate the compatibility adapter through a public route.

The access code is sent in a dedicated request header, compared only on the server, excluded from logs, kept only in browser session memory, and never placed in a URL, persisted browser storage, analytics event, or repository file. The judge demo enters the code and requests GPT mode; the ungated public experience remains Local.

### 8.3 Rate and Budget Protection

- The target deployment enforces at most 10 GPT requests per trusted client IP per minute.
- The target deployment enforces at most 60 GPT requests per trusted client IP per hour.
- The target deployment enforces at most 2 concurrent GPT requests per trusted client IP.
- The live GPT path requires a server-side `DEMO_ACCESS_CODE`.
- The access code is shared with judges through private Devpost testing instructions and is never committed.
- The access code is high-entropy, stored only as a deployment secret, compared without data-dependent early exit, and rotated if exposed; failed code attempts are rate-limited.
- The OpenAI project uses a separate spend limit as the final budget guard.
- Client IP is derived only from the hosting platform's trusted request metadata, never from an arbitrary user-supplied forwarding header.
- The deployment-level control or `RateLimiter` adapter must be globally consistent for the target runtime. A memory-backed limiter is supplemental defense only and cannot satisfy the release gate across multiple serverless instances.
- If a globally effective limit cannot be verified, the GPT path remains judge-gated and is not advertised as an unrestricted public endpoint; the public Local path remains usable.

### 8.4 Privacy

Before the first GPT-5.6 request, the UI requires acknowledgement that:

- the current message and necessary structured facts are sent to OpenAI for extraction;
- users should not enter names, ticket numbers, membership numbers, reservation numbers, payment details, or other unnecessary identifiers;
- raw travel narratives are not intentionally persisted by the application;
- OpenAI requests use `store: false`;
- application logs exclude raw messages, complete facts, secrets, and access codes.

The outbound OpenAI payload is constructed from an explicit allowlist rather than by serializing the API request. It contains the redacted current message plus only the prior canonical incident, provider/carrier and route labels needed for co-reference, bounded boolean/enum/numeric eligibility facts, and names of unresolved fields. It excludes the UI transcript, derived regions, full assessment, free-form expense and evidence lists, `userGoal`, feedback, access code, and request headers.

Before outbound transmission, deterministic redaction removes labelled booking, ticket, membership, and payment identifiers plus email addresses and phone numbers. Redaction is tested not to remove ordinary route, date, delay, or flight facts. Structured logs contain only request ID, non-sensitive error category, mode/provider/model, duration, bounded token counts, and aggregate status. Logger and outbound-request snapshot tests prove that raw messages and complete fact objects are absent.

### 8.5 Unified API Errors

All API errors use:

```ts
{
  error: {
    code;
    message;
    requestId;
    retryable;
  };
}
```

Status mapping:

- 400: invalid JSON or malformed request;
- 401: missing or invalid demo access code for the GPT path;
- 413: request too large;
- 415: unsupported media type when JSON is required;
- 422: semantically invalid fact constraints, or a non-retryable model refusal;
- 429: rate, concurrency, or application budget restriction;
- 502: invalid upstream model content when no safe fallback result can be produced;
- 504: upstream model timeout when no safe fallback result can be produced.

Ordinary missing facts are part of the product workflow: they return a successful structured response with `status: "needs_information"`, not an API error.

### 8.6 Model Failure Policy

- A valid GPT-mode request with no configured OpenAI key uses Local fallback.
- Timeout, upstream 429, upstream 5xx, invalid JSON, or schema violation: record a non-sensitive error category and use Local fallback. A valid fallback returns 200 with `extraction.provider: "local"` and a safe `fallbackReason` category.
- OpenAI safety refusal: return a non-retryable 422 error with `error.code: "model_refusal"`; do not automatically use Local extraction to bypass the refusal.
- A 502 or 504 is returned only when the corresponding upstream failure cannot produce a valid Local fallback response.
- Deterministically recognizable high-risk and out-of-scope inputs return before model and retrieval calls. A second high-risk guard runs after raw-fact merge and before assessment/retrieval so a missed preflight signal still cannot receive normal analysis.
- Every fallback result passes through the same server resolver and scenario evaluator as an OpenAI result.

## 9. Work Packages and Claimable Acceptance Tasks

### WP1: Trustworthy Domain Contract

| ID | Task | Owner | Dependencies | Definition of Done | Required Evidence |
|---|---|---|---|---|---|
| WP1-01 | Freeze the public allowlist | Codex | None | Public routes normalize canonical frozen incidents and approved legacy aliases; aliases cannot assert controllability or regime; the server derives only the four documented `ScenarioId` values | Alias, baggage, insurance, property-loss, unrelated-hotel, and ambiguous-scope API tests |
| WP1-02 | Separate raw and derived facts | Codex | WP1-01 | External region, carrier-region, regime, controllability, and scenario values are ignored or overwritten; resolver provenance and the complete active scenario set are returned | Conflicting US/EU injection, dual US+EU applicability, and non-EU carrier inbound tests |
| WP1-03 | Complete raw facts and deterministic patch merge | Codex | WP1-01 | Every material eligibility fact reaches assessment with provenance; explicit set/clear, conflicts, fact revisions, and stale async responses follow the documented merge rules | 20-versus-240-minute, voluntary-to-involuntary, Paris-to-London, clear-field, conflict, and out-of-order-response tests |
| WP1-04 | Implement the four scenario condition matrices | Codex with human policy review | WP1-02, WP1-03 | Each journey has explicit required, optional, and excluding conditions; overlapping US and EU/UK evaluators combine without losing remedies; carrier commitments require an exact applicable-carrier record | Positive, needs-information, negative, dual-scenario, and carrier-specific commitment fixture coverage |
| WP1-05 | Replace ambiguous strength with remedy assessment | Codex | WP1-04 | Every remedy returns status, matched conditions, missing conditions, exclusions, and sources; no dashboard commitment is generalized across carriers | Non-member Marriott, short EU delay, weather, voluntary bump, matching-United, no-matching-commitment, and unknown-carrier regression tests |
| WP1-06 | Add two-stage high-risk and unsupported guards | Codex | WP1-01, WP1-03 | Five documented risk families stop before normal analysis; directly recognizable cases stop before LLM, and the post-merge guard stops retrieval | Zero model calls for direct fixtures; zero retrieval calls and `unsupported_high_risk` for all fixtures |
| WP1-07 | Decouple applicability from ranking | Codex | WP1-04, WP1-05 | Active legal regimes and remedies are independent of display Top-K; ranking reasons survive to the view model | Four-plus-policy fixture, dual-scenario fixture, and display-limit invariance test |

The five high-risk fixture families are: acute medical or safety emergency including chemical ingestion; personal injury or illness compensation; litigation or legal-strategy requests; significant property loss or theft; and complex insurance or coverage disputes. The response directs the user to appropriate professional or emergency help without ordinary claims analysis.

### WP2: Source-Transparent Product Experience

| ID | Task | Owner | Dependencies | Definition of Done | Required Evidence |
|---|---|---|---|---|---|
| WP2-01 | Build source-aware view models | Codex | WP1-05 | Policies and cases preserve source, authority, conditions, dates, review notes, and synthetic state | Mapper unit tests |
| WP2-02 | Separate source sections in UI | Codex | WP2-01 | Regulation/guidance, provider commitments, community cases, user reports, and synthetic examples are visibly distinct | Browser assertions for every source badge |
| WP2-03 | Isolate synthetic examples | Codex | WP2-01 | Synthetic is always prominent and cannot outrank a comparable real case | Ranking and browser tests |
| WP2-04 | Add fact review and correction | Codex | WP1-03 | Users can set or explicitly clear material facts, see conflicts, and trigger a clean revision-safe reassessment | Voluntary-to-involuntary, route-correction, clear-field, and stale-response E2E tests |
| WP2-05 | Render explanation and next action | Codex | WP1-05, WP2-01 | UI shows facts used, matched/missing conditions, summary, evidence status, a single next action, and the informational-not-legal-advice boundary | Four-journey browser checks |
| WP2-06 | Add model and privacy state | Codex | WP2-05 | UI shows `OpenAI · gpt-5.6-luna` or `Local fallback`, privacy acknowledgement, and data-minimization warning | UI and request-snapshot tests |
| WP2-07 | Add privacy-safe result feedback | Codex | WP2-05 | Users can mark helpful, fact error, or source mismatch; competition feedback is session-local or explicitly downloaded, excludes raw narrative, and never mutates approved knowledge automatically | Browser test plus feedback payload privacy assertion |

### WP3: Engineering Completeness, Evaluation, and Deployment

| ID | Task | Owner | Dependencies | Definition of Done | Required Evidence |
|---|---|---|---|---|---|
| WP3-01 | Standardize the toolchain | Codex | Dependency-install approval | Node and npm versions are fixed; `typecheck`, `test:e2e`, and `verify` scripts exist; lint uses supported ESLint invocation | Clean `npm ci` and all script exit codes |
| WP3-02 | Enforce input and output limits | Codex | WP1-01, WP1-03 | Oversized input is rejected before model cost; the adapter sends `max_output_tokens: 1200`; returned content is bounded and schema-validated before merge | 413/422 tests, zero model calls for rejected input, adapter request snapshot, and oversized-response fixture |
| WP3-03 | Enforce extraction mode, access, rate, concurrency, and budget guards | Codex plus user environment configuration | WP3-02 | Local mode never calls a model; GPT mode requires consent and valid demo access; only OpenAI is wired publicly; globally effective limits return 429 | Missing/invalid-code, Local-no-call, DeepSeek-env-negative, burst, cross-instance or deployment-layer, and concurrency tests |
| WP3-04 | Implement unified errors and model failure classes | Codex | WP3-02 | Refusal, timeout, upstream 429/5xx, invalid JSON, and schema errors are distinct and safely handled | Adapter and route contract tests |
| WP3-05 | Strengthen knowledge and source validation | Codex with human source review | Network approval for release source check | Runtime loader and CI validate fields, enums, arrays, URL form, dates, IDs, source types, synthetic rules, and provider applicability; critical sources and carrier-specific commitments are human-reviewed within 30 days and checked reachable within 48 hours of release | Invalid fixture matrix, carrier-scope validation, successful data gate, and dated source-review checklist |
| WP3-06 | Keep normal tests offline | Codex | WP3-01 | Unit, API, and E2E tests cannot use a real API key, even if the environment contains one | Network-denial test configuration and mock assertions |
| WP3-07 | Add four-journey browser E2E | Codex | WP1-04 through WP1-07, WP2-02 through WP2-06, Playwright approval | Four golden journeys and material negative journeys pass from UI input through result | E2E report and screenshots as needed for verification |
| WP3-08 | Build bilingual GPT-5.6 evaluation | Codex plus user API authorization | WP1-04 through WP1-06, WP3-04, WP3-06, WP3-11 | 40-60 anonymous Chinese and English cases run only with explicit live-eval opt-in and the frozen scoring contract | Versioned dataset, ground truth, scorer tests, raw aggregate metrics, and summarized report |
| WP3-09 | Add CI | Codex | WP3-01, WP3-05, WP3-06, WP3-11, WP3-12 | Clean install, data validation, lint, typecheck, unit/API tests, build, and offline browser tests run without secrets | Green GitHub Actions run on final commit |
| WP3-10 | Deploy and verify Vercel | Codex plus user account/secret authorization | WP3-03, WP3-07, WP3-09, WP3-11, WP3-12 | Preview and production deployments pass Local and controlled GPT smoke checks; health and rollback paths exist | URL, commit SHA, verification time, smoke result, and rollback note |
| WP3-11 | Enforce outbound privacy and safe telemetry | Codex | WP1-03, WP2-06, WP3-02 | OpenAI payload uses the documented allowlist and redaction; logs and errors contain no raw narrative, complete facts, access code, or secrets | Outbound snapshot, redaction, logger-spy, and exception-path tests |
| WP3-12 | Complete release security and repository hygiene | Codex | WP3-01, network approval for dependency audit | API enforces JSON content type and safe headers; errors hide stacks; tracked OS artifacts are removed and ignored; secret scan is clean; dependency audit has no unexplained high/critical finding | Route/header tests, clean repository check, secret-scan result, and dated dependency-audit record |

### WP4: Build Week Evidence and Submission

| ID | Task | Owner | Dependencies | Definition of Done | Required Evidence |
|---|---|---|---|---|---|
| WP4-01 | Document prior versus new work | Codex with user fact check | None | README and Build Log distinguish `66082e4` from submission-period work | Dated commit map and human-reviewed narrative |
| WP4-02 | Document Codex collaboration and human decisions | Codex draft, user approval | Implementation evidence | README identifies Codex acceleration, corrections, and key human decisions | Accurate section linked to commits/tests |
| WP4-03 | Document GPT-5.6 use | Codex draft, user approval | WP3-08 | README states exact model role, API pattern, privacy choice, eval result, and limitations | Code links, tests, model badge, and eval report |
| WP4-04 | Add public-repository licensing | Codex after approval | None | Repository contains MIT License and submission links to the licensed repository | `LICENSE` in final commit |
| WP4-05 | Produce verification artifacts | Codex | WP3 completion | Eval, verification, and deployment reports name the final commit | Reports contain no secrets or user PII |
| WP4-06 | Prepare the demo script | Codex draft, user recording | Stable production build | Script fits 2:35-2:50 and covers product, Codex, GPT-5.6, sources, and limitations | Rehearsed timing and final YouTube link |
| WP4-07 | Obtain human submission inputs | User/team | None | Name, edited description, truthful submitter type, team invitations, `/feedback` ID, and video URL are complete | User confirmation and Devpost preview |
| WP4-08 | Validate and submit Devpost project | Joint, final user confirmation | All release gates | Project is no longer `Untitled` or draft and all required fields pass validation | Devpost reports `submitted_at` and submitted status |

## 10. Testing and Evaluation

### 10.1 Toolchain

The repository remains npm-based because its committed lock file and documented commands are npm-based. This is the repository-specific exception the user approved on 2026-07-18 after inspection; the generic pnpm workspace convention does not trigger a package-manager migration during the freeze. The implementation will fix the Node and npm versions and provide:

- `validate:data`
- `lint`
- `typecheck`
- `test`
- `test:e2e`
- `build`
- `verify`

`verify` runs data validation, lint, typecheck, unit/API tests, and production build in that order. Browser tests run as a separately identifiable stage.

### 10.2 Decision Matrix

Every frozen journey has at least:

- one supported fixture;
- one missing-information fixture;
- one conditional or not-applicable fixture.

Cross-cutting negative fixtures include:

- forged or conflicting region;
- hallucinated carrier region;
- one-to-twenty-minute EU delay;
- non-member or OTA Marriott booking;
- voluntary versus involuntary bump;
- weather and user-initiated cancellation;
- United with a matching current commitment, a carrier with no matching commitment record, and an unknown operating carrier;
- acute medical/safety emergency, personal injury, litigation, significant property loss, and complex insurance;
- oversized input;
- prompt attempts to override the extraction schema, inject derived regions, reveal secrets, or alter system behavior;
- model refusal, timeout, upstream 429/5xx, invalid JSON, and schema violation;
- missing API key;
- synthetic-versus-community presentation.

### 10.3 Live GPT-5.6 Evaluation

Live evaluation is explicitly enabled, for example with `RUN_LIVE_OPENAI_EVALS=1`. Normal tests are offline.

The versioned evaluation contract contains 40-60 anonymous synthetic cases, with at least eight cases for each frozen journey split across Chinese and English, plus dedicated ambiguity, high-risk, and prompt-injection cases. Each case freezes:

- dataset and scorer version;
- anonymous case ID and language;
- whether a GPT call is eligible;
- expected top-level status and exact active `scenarioIds` set;
- critical extracted fields and their accepted normalized values;
- expected missing-information, safety, and fallback behavior.

The evaluation stores only:

- timestamp;
- commit SHA;
- model name;
- anonymous case ID;
- pass/fail and critical-field scores;
- latency;
- fallback category;
- token usage.

It does not store API keys, real user narratives, names, ticket details, or private responses.

Metrics are calculated as follows:

- **Structured-output success:** valid strict-schema GPT responses divided by all GPT-eligible cases attempted. A Local fallback is valid product behavior but counts as a GPT structured-output miss.
- **Critical-fact accuracy:** macro-average of per-case critical-field accuracy, so every case has equal weight. A refusal or invalid GPT response scores zero for that case rather than disappearing from the denominator.
- **Journey/status accuracy:** full-pipeline cases with both the exact expected `scenarioIds` set and expected top-level status divided by all full-pipeline cases. `needs_information` is scored as an ordinary expected status; its required missing fields are critical assertions.
- **Injection and safety failures:** raw counts over their explicitly tagged fixture subsets; any schema escape, derived-fact override, secret exposure, or normal analysis for a high-risk case is a failure.

The release report comes from one complete non-selective run against a fixed commit, dataset version, scorer version, model, prompt, and schema. The harness may retry a retryable transport failure once according to a rule fixed before the run; it records both first-attempt and final metrics, and the thresholds use the final outcome. Selective case reruns cannot replace the full report. Any change to relevant code, prompt, schema, model configuration, dataset, or scorer invalidates the report and requires a full rerun.

Release targets are:

- structured-output success at least 98%;
- critical-fact accuracy at least 95%;
- frozen-journey classification at least 95%;
- zero successful jurisdiction or prompt-injection cases that alter derived facts, escape the extraction schema, or expose secrets;
- zero high-risk cases receiving normal analysis;
- zero unlabeled synthetic cases;
- 100% valid fallback responses for eligible model-failure tests;
- three consecutive successful rehearsals of every primary demo path.

Deterministic validation, tests, build, and browser gates are reported separately from live-model quality. An upstream outage does not erase deterministic code evidence, but a qualifying live-evaluation report on the final relevant commit remains a submission blocker.

## 11. CI, Deployment, and Rollback

GitHub Actions runs without a real OpenAI key:

1. clean npm install;
2. data validation;
3. lint;
4. typecheck;
5. unit and API tests;
6. production build;
7. offline browser tests.

Secrets are never exposed to fork pull requests. Live evaluation is local or a controlled manual workflow only.

Vercel release sequence:

1. preview deployment;
2. Local fallback smoke test;
3. configure OpenAI key, demo access code, limits, and project spend limit;
4. controlled GPT-5.6 smoke test;
5. four-journey E2E;
6. production deployment;
7. save URL, commit SHA, validation time, and results.

The health endpoint may report application version, commit SHA, knowledge-load status, and whether OpenAI is configured. It may not return secrets, access codes, or internal errors.

Rollback uses the previous verified Vercel deployment and its associated Git commit. No database migration is in scope, so application rollback has no data-migration dependency.

## 12. Build Week Evidence and Submission

### 12.1 Evidence Files

The implementation produces:

- `README.md` sections for Build Week work, Codex collaboration, human decisions, GPT-5.6 use, setup, evaluation, and limitations;
- `docs/build-week/BUILD_LOG.md`;
- `docs/build-week/EVAL_REPORT.md`;
- `docs/build-week/VERIFICATION.md`;
- `docs/build-week/SOURCE_REVIEW.md`;
- `docs/build-week/SECURITY_CHECK.md`;
- `docs/build-week/DEMO_SCRIPT.md`;
- `LICENSE` using MIT terms.

No evidence artifact contains secrets, access codes, private session content, or user travel PII.

### 12.2 Video Design

Target duration is 2:35-2:50:

- 0:00-0:20: user problem;
- 0:20-1:25: Air France multi-turn flow;
- 1:25-1:50: short-delay, weather, or forged-region negative example;
- 1:50-2:10: official, provider, community, and synthetic source labels;
- 2:10-2:30: GPT-5.6 extraction and deterministic assessment boundary;
- 2:30-2:45: Codex build-week expansion, testing, and review;
- 2:45-2:50: limitations and close.

The final video is public on YouTube, is under three minutes, has English narration or an English translation, and uses only authorized assets.

### 12.3 Human-Only Inputs

The user/team must truthfully provide or authorize:

- OpenAI API access without sharing the key in chat or Git;
- country of residence and adult eligibility attestations entered directly in Devpost;
- final project name;
- final human-reviewed tagline;
- final human-edited Devpost description;
- submitter type and accepted team invitations;
- public YouTube URL;
- `/feedback` Session ID from the thread where most core functionality was built;
- final Devpost submission confirmation.

Eligibility values are supplied and re-checked by the user/team directly in Devpost. They are not copied into repository evidence files.

### 12.4 Final Devpost Gate

Before submission:

- project is no longer named `Untitled`;
- name, tagline, and description have been human-reviewed and accurately distinguish prior work from Build Week work;
- `Built with` truthfully identifies Codex, GPT-5.6, and the implemented stack without making DeepSeek part of the core narrative;
- text and video materials are in English or include an English translation;
- category is `Apps for Your Life`;
- country and submitter type are truthful;
- every listed team member has accepted;
- repository is accessible and licensed;
- test deployment is available;
- video is public and under three minutes;
- `/feedback` ID is correct;
- final commit has green CI, build, E2E, and GPT-5.6 evidence;
- the user has reviewed the final Devpost preview.

The final external submit action occurs only after explicit user confirmation. Success requires Devpost to report a non-draft submitted status and non-null submission time.

## 13. Execution Order

1. WP1-01 freezes canonical incidents, legacy aliases, and derived scenario IDs.
2. WP1-02 and WP1-03 establish the server-owned derivation and revision-safe raw-fact contracts in parallel.
3. WP1-04 and WP1-06 establish scenario and safety gates; WP1-05 and WP1-07 then establish deterministic remedy assessment.
4. WP2 establishes source transparency, fact correction, privacy state, explanations, and session-local feedback.
5. WP3-01, WP3-02, WP3-05, WP3-06, WP3-11, and WP3-12 establish reproducible engineering, source, privacy, and security foundations.
6. WP3-03 and WP3-04 establish controlled GPT access and failure handling.
7. WP3-07 and WP3-08 establish browser and live-model evidence.
8. WP3-09 and WP3-10 establish CI and production readiness.
9. WP4 produces evidence, video materials, Devpost fields, and final submission.

Independent tasks may run in parallel only when they do not write the same files or depend on an unstable contract.

## 14. Release Definition of Done

The code work is complete only when:

- every frozen journey passes supported, needs-information, and negative cases;
- overlapping US and EU/UK scenarios preserve every applicable remedy independent of display order;
- material user facts change assessments correctly;
- explicit corrections, clears, conflicts, and stale async responses obey the fact-revision contract;
- every user-visible source has a correct type and URL where available;
- every provider commitment matches the applicable carrier and freshness gate; unknown or unmatched carriers never receive a supported commitment;
- every synthetic example is visibly synthetic;
- result feedback cannot expose the raw narrative or automatically mutate the knowledge base;
- high-risk and out-of-scope inputs cannot reach normal analysis;
- input, privacy, access, rate, concurrency, token, and budget protections are active;
- Local mode, GPT mode, OpenAI-only routing, outbound payload minimization, and safe telemetry satisfy their negative tests;
- release source review, security headers, secret scan, repository hygiene, and dependency audit are documented;
- normal tests are offline;
- data validation, lint, typecheck, unit/API tests, production build, and browser E2E are green;
- live GPT-5.6 evaluation meets the documented targets;
- preview and production smoke tests pass;
- rollback is documented and usable;
- README and evidence documents match actual behavior;
- no unexplained P0 or submission-blocking P1 issue remains.

The competition submission is complete only when the code release gate is satisfied and Devpost reports a final submitted status.

## 15. Controlled Openness After the Freeze

Additional work is allowed only after all release gates are green and submission artifacts are on track. The prioritized extension backlog is:

1. additional negative and bilingual evaluation cases;
2. improved airport and carrier registries;
3. explicitly consented persistent outcome tracking through `FeedbackSink`, extending the required session-local feedback without storing raw narratives;
4. selected dormant jurisdictions with their own condition matrices;
5. a persistent limiter adapter;
6. database and semantic retrieval only if evaluation shows the current repository is the bottleneck.

An extension must not weaken, bypass, or silently change the frozen four-journey contract.
