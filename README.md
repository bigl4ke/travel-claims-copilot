# Travel Claims Copilot

Travel Claims Copilot is a demo web app for exploring travel disruption claims and communication strategy.

The user describes a hotel or airline issue, and the app returns:

- issue type
- claim strength
- relevant official policies or regulations
- similar community datapoints
- conservative / standard / aggressive asks
- evidence checklist
- reusable communication scripts
- cautions and uncertainty

The product does **not** provide legal advice, promise compensation, or submit claims for users. It helps users organize facts, find relevant references, and prepare reasonable requests.

## Current Status

This repo is in an MVP / Phase 1 state.

The app currently uses:

- Next.js App Router
- TypeScript
- Tailwind CSS
- local JSON seed data
- deterministic keyword classification
- deterministic retrieval and response generation

There is no database, login, payment, scraping, email sending, or real LLM API integration yet.

## How To Run

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Build for production:

```bash
npm run build
```

## Demo Test Inputs

Hotel walk:

```text
I had a confirmed Marriott Sheraton reservation booked directly, but when I arrived the front desk said the hotel was oversold and had no room. They moved me to a cheaper nearby hotel and did not offer compensation.
```

Airline controllable cancellation:

```text
United cancelled my flight because of a crew issue and rebooked me for tomorrow morning. The airport agent said they would not provide a hotel or meal voucher.
```

Baggage delay:

```text
Southwest made me gate-check my bag during a connection through MDW, but the bag did not arrive at SEA. They said it may come tomorrow and only offered delivery.
```

Hotel room feature mismatch:

```text
I paid extra to upgrade to a Hyatt suite because the website showed specific amenities, but the room was missing some of them and one advertised feature was broken.
```

Denied boarding / voluntary bump:

```text
AA oversold my flight and the gate agent asked for volunteers to take a later flight. The next available flight may be tomorrow.
```

## Project Structure

```text
app/
  api/
    analyze/route.ts      Main analysis API
    scenarios/route.ts    Scenario catalog API
  page.tsx                Frontend demo page

data/
  policies.example.json   Official policy / regulation seed data
  cases.example.json      Community and synthetic case seed data
  scripts.example.json    Communication script seed data

lib/
  analyze.ts              Thin orchestration compatibility wrapper
  classifier.ts           Keyword-based fact extraction and issue classification
  retrieval.ts            Local JSON policy/case/script retrieval
  generator.ts            Deterministic AnalysisResult generation
  scenarios.ts            Scenario summary builder
  issueTaxonomy.ts        Issue labels, aliases, and normalization
  types.ts                Shared TypeScript types
```

## Current Pipeline

The current analysis flow is deterministic:

```text
user input or selected scenario
  -> classifyInput()
  -> retrieveKnowledge()
  -> generateAnalysis()
  -> AnalysisResult
```

The long-term goal is to keep this structure and plug an LLM into selected stages:

- use LLM for structured fact extraction
- keep deterministic keyword classification as fallback
- retrieve policies, cases, and scripts from the knowledge base
- use LLM to generate a more natural answer from retrieved evidence only

The LLM should not invent policies, cases, compensation amounts, or sources.

## APIs

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

Analyze by free-text description:

```json
{
  "description": "United cancelled my flight because of a crew issue and rebooked me tomorrow."
}
```

Analyze by selected issue type:

```json
{
  "issueType": "hotel_room_feature_mismatch"
}
```

Analyze by selected case:

```json
{
  "caseId": "nitan_uscf_cx_cancel_rebook_ua_delay_2026_05"
}
```

Returns:

```ts
{
  issueType: string;
  strength: "low" | "medium" | "high";
  summary: string;
  officialBasis: Policy[];
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

### `data/policies.example.json`

Official policies, regulations, dashboards, or company commitments.

Examples:

- Marriott Ultimate Reservation Guarantee
- DOT Airline Cancellation and Delay Dashboard
- EU passenger rights

### `data/cases.example.json`

Community datapoints, user-submitted cases, and synthetic demo examples.

Important rule: community cases are reference datapoints, not official rules. Forum cases should be rewritten as summaries and should preserve source links without copying full posts or personal information.

### `data/scripts.example.json`

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

- deterministic app flow
- local JSON seed data
- split classifier / retrieval / generator / scenarios modules
- scenario-aware APIs

Recommended next work:

- add more official policies
- add more cases
- add more scripts
- add test prompts with expected issue types
- improve frontend scenario selection UI

### Phase 2: LLM-Assisted Analysis

Add `lib/llm.ts` and use an LLM for:

- structured fact extraction
- issue classification assistance
- natural-language answer generation from retrieved data

Keep deterministic fallback.

### Phase 3: Database

Move local JSON data into a database such as Supabase:

- policies
- cases
- scripts
- outcomes
- scenario taxonomy

### Phase 4: Retrieval

Add structured filtering and vector search:

- filter by issue type, provider, route, location, booking channel, and status
- search similar cases by embeddings
- rank cases by relevance and outcome quality

### Phase 5: Product Loop

Let users submit outcomes:

- what they asked for
- what response they received
- whether the script helped
- final compensation or resolution

This outcome data can later improve case ranking and script suggestions.
