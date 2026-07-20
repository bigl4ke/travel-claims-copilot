# Travel Claims Copilot

Travel Claims Copilot is a demo web app for exploring travel disruption claims and communication strategy.

The user describes a hotel or airline issue, and the app returns:

- issue type
- evidence coverage and unresolved applicability checks
- relevant official policies or regulations
- similar community datapoints
- conservative / standard / aggressive asks
- evidence checklist
- reusable communication scripts
- cautions and uncertainty

The product does **not** provide legal advice, promise compensation, or submit claims for users. It helps users organize facts, find relevant references, and prepare reasonable requests.

## Current Status

This repo has a structured MVP plus the first LLM-assisted intake workflow.

The app currently uses:

- Next.js App Router
- TypeScript
- Tailwind CSS
- local JSON seed data
- optional multi-turn LLM fact extraction through OpenAI Responses or DeepSeek Chat Completions
- strict `ClaimFacts` JSON Schema validation with incident and jurisdiction kept separate
- deterministic local extraction when no API key is configured or a model call fails
- explainable weighted retrieval with deterministic Top-K results
- approved-case filtering and deterministic response generation
- pre-LLM safety routing for unsupported high-risk claims
- bounded intake and analysis inputs
- Vitest golden-scenario and quality-guard tests

There is no database, login, payment, scraping, email sending, or claim submission. Conversation
state currently stays in the browser and is not persisted.

The current knowledge base contains 10 policies, 55 reviewed case records (35 approved for
retrieval), and 14 reusable scripts. The first demo publishes four incident types:

- `hotel_walk`
- `airline_delay`
- `airline_cancellation`
- `denied_boarding`

EU261, UK261, Canada APPR, US DOT, Australian Consumer Law, Chinese civil-aviation regulations,
and provider commitments are policy scopes selected from route direction, operating carrier,
provider, and controllability. They are not incident types.

## How To Run

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

To enable LLM-assisted intake, copy `.env.example` to `.env.local` and configure one provider.
For OpenAI:

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_INTAKE_MODEL=gpt-5.6-luna
```

For DeepSeek:

```bash
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_key_here
DEEPSEEK_INTAKE_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

For backward compatibility, a DeepSeek setup using `OPENAI_API_KEY`, a `deepseek-*` model, and
`OPENAI_BASE_URL=https://api.deepseek.com/` is detected automatically. The obsolete bare model
name `deepseek-v4` is normalized to `deepseek-v4-flash`. Without a configured key, the same UI
uses the deterministic fallback and labels it as `Local`.

Open:

```text
http://localhost:3000
```

Build for production:

```bash
npm run build
```

Validate the data and run the retrieval test suite:

```bash
npm run validate:data
npm test
```

## Demo Test Inputs

Hotel walk:

```text
I had a confirmed Marriott Sheraton reservation booked directly, but when I arrived the front desk said the hotel was oversold and had no room. They moved me to a cheaper nearby hotel and did not offer compensation.
```

Airline cancellation with a controllable reason:

```text
United cancelled my flight because of a crew issue and rebooked me for tomorrow morning. The airport agent said they would not provide a hotel or meal voucher.
```

Airline delay with a controllable reason:

```text
My American Airlines flight was delayed overnight because of a mechanical problem.
```

Denied boarding / voluntary bump:

```text
Delta oversold my flight and the gate agent asked for volunteers to take a flight the next day.
```

EU-region cancellation:

```text
My Air France flight from Paris was cancelled and I arrived at my final destination four hours late.
```

## Project Structure

```text
app/
  api/
    intake/route.ts       Multi-turn structured fact intake API
    analyze/route.ts      Deterministic structured analysis API
    scenarios/route.ts    Scenario catalog API
  page.tsx                Frontend demo page

data/
  policies.json           Official policy / regulation data
  cases.json              Consolidated, quality-reviewed case data
  scripts.json            Communication script data
  README.md               Review rules and current quality summary

lib/
  claimFacts.ts           ClaimFacts types, JSON Schema, validation, and missing fields
  jurisdiction.ts         Location, carrier, EU261, and UK261 route enrichment
  policyScope.ts          Route applicability and controllability rules
  intake.ts               Multi-turn extraction, fact merging, questions, and fallback
  llm.ts                  OpenAI and DeepSeek structured-output adapters
  analyze.ts              Structured-facts and legacy-description orchestration
  classifier.ts           Structured fact extraction and issue classification
  retrieval.ts            Top-K local JSON policy/case/script retrieval
  retrievalScoring.ts     Explainable, deterministic ranking rules
  generator.ts            Deterministic AnalysisResult generation
  scenarios.ts            Scenario summary builder
  issueTaxonomy.ts        Issue labels, aliases, and normalization
  types.ts                Shared TypeScript types

tests/
  claimFacts.test.ts      Schema, jurisdiction, and structured API tests
  intake.test.ts          LLM client, fallback, and multi-turn API tests
  intake-evals.test.ts    Colloquial and multi-turn evaluation conversations
  retrieval.test.ts       Five golden scenarios plus classification/retrieval guards
```

## Current Pipeline

The current product flow separates semantic intake from deterministic analysis:

```text
natural user message + prior ClaimFacts
  -> POST /api/intake
  -> provider-specific LLM structured output, or deterministic fallback
  -> server validation + jurisdiction enrichment + missing-field calculation
  -> targeted follow-up question until ready
  -> POST /api/analyze with validated ClaimFacts
  -> incident type + origin/destination regions + operating carrier + controllability
  -> deterministic legal-regime applicability rules
  -> scope-aware policy / case / script scoring
  -> Top-K retrieval (3 policies / 3 cases / 2 scripts)
  -> generateAnalysis()
  -> AnalysisResult
```

Policy filtering first checks incident type, route direction, operating-carrier rules, provider
scope, and required controllability. A policy's `legal_regime` is distinct from its geographic
`applicable_regions`, and `applicability_rule` controls deterministic route matching. Case ranking
then considers incident, region, provider, country, booking channel,
loyalty status, disruption reason, text overlap, source authority, and confidence. Equal scores
use stable IDs as a deterministic tie-breaker. Only cases with `review_status: "approved"` can
be returned.

### LLM boundaries

The LLM is an interviewer and semantic parser, not the policy engine or retrieval database.
It receives prior structured facts plus the latest user message and must return the strict
four-incident `ClaimFacts` schema. The server recomputes missing fields, geographic regions,
policy scope, and controllability.

`disruptionReasonStatus` distinguishes a reason that has not been requested yet from a reason
the user explicitly cannot obtain. An `unavailable` reason does not trigger another question;
cause-dependent policies remain conditional instead.

The OpenAI adapter requests strict JSON Schema output with `store: false`. The DeepSeek adapter
uses Chat Completions JSON Output and includes the same schema in its system prompt. Both use a
bounded timeout, runtime `ClaimFacts` validation, and a deterministic fallback. `/api/analyze`
never relies on model memory for policies, cases, compensation amounts, or sources.

The LLM should not invent policies, cases, compensation amounts, or sources.

## APIs

### `POST /api/intake`

Start or continue a fact-gathering conversation:

```json
{
  "message": "My Air France flight from Paris was cancelled and I arrived four hours late.",
  "facts": null
}
```

The response is either `needs_info` with the accumulated `facts`, `missingFields`, and one
targeted `question`; `ready` with validated facts that can be sent to `/api/analyze`; or
`unsupported` with a professional-help safety notice. High-risk screening happens before an
LLM call. Intake messages are limited to 4,000 characters.

### `GET /api/scenarios`

Returns scenario summaries derived from local case data.

Example response shape:

```ts
{
  scenarios: Array<{
    issueType: string;
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
  }>;
}
```

### `POST /api/analyze`

The preferred request uses the validated `facts` returned by `/api/intake`:

```ts
{
  description: "Optional original conversation text",
  facts: intakeResponse.facts
}
```

The complete object must match `ClaimFacts`; incomplete valid facts receive HTTP `422` with
`missingFields`. Descriptions are limited to 12,000 characters. High-risk descriptions receive
HTTP `422` with a safety category and do not enter classification or retrieval. The following
legacy inputs remain supported for compatibility.

Analyze by free-text description:

```json
{
  "description": "United cancelled my flight because of a crew issue and rebooked me tomorrow."
}
```

Analyze by selected issue type:

```json
{
  "issueType": "denied_boarding"
}
```

Analyze by selected case:

```json
{
  "caseId": "uscf_cx_ua_rebooking_mixed_carrier_2026_05"
}
```

Returns:

```ts
{
  issueType: string;
  policyRegions: Array<"EU_EEA_CH" | "UK" | "US" | "CA" | "AU" | "CN" | "other" | "global">;
  legalRegimes: Array<
    | "provider_policy"
    | "EU261"
    | "UK261"
    | "US_DOT_REFUND"
    | "US_DOT_DENIED_BOARDING"
    | "US_AIRLINE_COMMITMENT"
    | "CA_APPR"
    | "AU_ACL"
    | "CN_FLIGHT_REGULATION"
  >;
  controllability: "controllable" | "uncontrollable" | "unknown";
  evidenceCoverage: {
    officialBasisStatus: "scope_confirmed" | "conditional" | "not_found";
    officialSourceCount: number;
    reportedCaseCount: number;
    syntheticCaseCount: number;
    unresolvedConditionCount: number;
    unmetRemedyConditionCount: number;
  };
  summary: string;
  officialBasis: Policy[];
  policyAssessments: PolicyApplicabilityAssessment[];
  similarCases: Case[];
  suggestedAsks: {
    conservative: string[];
    standard: string[];
    aggressive: string[];
  };
  evidenceChecklist: string[];
  scripts: Script[];
  cautions: string[];
}
```

## Data Files

### `data/policies.json`

Official policies, regulations, dashboards, or company commitments.

Examples:

- Marriott Ultimate Reservation Guarantee
- DOT Airline Cancellation and Delay Dashboard
- EU261 and UK261
- Canada Air Passenger Protection Regulations
- US DOT automatic refund rules
- Australian Consumer Law travel guidance
- Chinese flight-regularity and passenger-service regulations

### `data/cases.json`

Community datapoints, user-submitted cases, and synthetic demo examples.

Important rule: community cases are reference datapoints, not official rules. Forum cases should be rewritten as summaries and should preserve source links without copying full posts or personal information.

Each case has a `review_status`. Only `approved` cases are eligible for retrieval; `needs_review` and `excluded` records remain in the consolidated file for provenance. See `data/README.md` for the current review summary and rules.

### `data/scripts.json`

Reusable communication templates for channels such as:

- front desk
- airport counter
- phone / chat
- email
- corporate escalation
- regulator complaint

## Product Boundaries

The app should avoid:

- promising compensation
- presenting output as legal advice
- fabricating policies, cases, URLs, or amounts
- treating community datapoints as official rules
- handling injury, major property loss, litigation, or complex insurance claims as normal cases

The app should clearly separate:

- official policy / regulation
- company commitment
- community datapoint
- goodwill request
- synthetic demo data

## Roadmap

### Phase 1: Structured MVP

Completed:

- consolidated, reviewed local JSON data
- deterministic structured extraction for the four demo issue types
- explainable structured filtering and Top-K ranking
- approved-only case retrieval
- replaceable async fact-extraction boundary
- guided multi-turn frontend with visible LLM/local extraction mode
- strict structured LLM intake with safe fallback
- automated golden-scenario, schema, API, colloquial, and multi-turn tests

Recommended next work:

- expand the airport/country and operating-carrier reference tables
- run the conversational evaluation set against a configured model and record latency/cost
- add outcome feedback logging before expanding the taxonomy

### Phase 2: LLM-Assisted Analysis

Implemented foundation:

- server-only OpenAI configuration
- strict structured fact extraction within the four-type allowlist
- multi-turn fact merging and targeted clarification
- deterministic fallback, schema validation, timeouts, and evidence-only retrieval

Recommended next step: evaluate model quality on real anonymized phrasing before adding an
LLM-written final response. Any later answer-generation model must use retrieved evidence only.

### Phase 3: Database

Move local JSON data into a database such as Supabase:

- policies
- cases
- scripts
- outcomes
- scenario taxonomy

### Phase 4: Semantic Retrieval

Keep structured filters and add embeddings/vector search only when the reviewed corpus and
evaluation set show that lexical ranking is the bottleneck:

- preserve issue type, provider, route, location, booking channel, and review-status filters
- search similar cases by embeddings
- rank cases by relevance and outcome quality

### Phase 5: Product Loop

Let users submit outcomes:

- what they asked for
- what response they received
- whether the script helped
- final compensation or resolution

This outcome data can later improve case ranking and script suggestions.
