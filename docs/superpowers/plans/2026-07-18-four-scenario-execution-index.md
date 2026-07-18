# Four-Scenario Build Week Execution Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the approved four-scenario freeze-and-harden design as four reviewable implementation plans, ending with a tested deployment and complete OpenAI Build Week evidence.

**Architecture:** The work is split into trustworthy domain/API, source-transparent product experience, engineering/evaluation/deployment, and Build Week evidence. Cross-plan interfaces below are frozen before UI and release work; each numbered task ends with targeted verification and a rollback-friendly commit.

**Tech Stack:** Next.js 15.5.18, React 19.2.6, TypeScript 5.5.4, Node.js 22.14.0, npm 10.9.2, Vitest 4.1.10, Playwright 1.55.0, Tailwind CSS 3.4, OpenAI Responses API, GPT-5.6 Luna, local JSON knowledge files, Vercel.

## Global Constraints

- Work from the approved specification at `docs/superpowers/specs/2026-07-18-four-scenario-trustworthy-build-week-design.md`; a scope change requires user approval and a spec amendment first.
- Use npm, the committed `package-lock.json`, Node.js `22.14.0`, and npm `10.9.2`; do not migrate this repository to pnpm.
- Ask before installing dependencies, using network access, running live OpenAI evaluation, deploying, changing GitHub state, or writing to Devpost.
- GPT-5.6 Luna is the only public/default model. DeepSeek remains importable compatibility code but is not selectable or environment-activated by public routes, UI, evals, README, video, or Devpost copy.
- GPT extracts an allowlisted raw fact patch only. The server owns regions, carrier region, controllability, scenario IDs, legal regimes, applicability, and remedy status.
- Public scope is `marriott_hotel_walk`, `us_airline_disruption`, `us_denied_boarding`, and `eu_uk_air_disruption`; delay/cancellation may activate both US and EU/UK scenarios.
- Top-level workflow status is `ready`, `needs_information`, `out_of_scope`, or `unsupported_high_risk`; remedy status is `supported`, `conditional`, or `not_applicable`.
- Do not add a database, vector search, login, payment, persistent raw narrative, automated claim filing, or additional public jurisdiction before submission.
- Maximum request body is 32 KB; message is 4,000 Unicode code points; ordinary string is 256; `userGoal` is 500; evidence and expense arrays have 20 items of 256 characters; OpenAI `max_output_tokens` is 1,200.
- GPT access requires privacy acknowledgement and a valid server-side demo code. Target limits are 10 GPT requests/IP/minute, 60/IP/hour, and 2 concurrent/IP, backed by a globally effective deployment control before unrestricted exposure.
- Do not log raw messages, complete facts, credentials, access codes, private model responses, or user PII. OpenAI requests use `store: false`.
- Provider commitments require an exact normalized applicable-carrier/role record, a fresh source review, and matched typed event predicates; unknown, unmatched, missing-condition, or stale records never receive `supported` commitments.
- Every displayed script carries 1..8 validated `source_ids` that resolve to policy IDs in the same knowledge snapshot. Script ranking admits only applicable/conditional cited policies, and the product must return one source card per cited ID even when that policy was outside display Top-K.
- Synthetic cases are always labelled and cannot outrank a comparable real approved case.
- Normal tests are offline and cannot use a real API key even when one exists in the environment.
- Use 2-space indentation, kebab-case for new files, functional logic without mutable globals, and React components under `src/components`.
- Every task starts with a failing test or failing verification, implements the smallest passing change, runs the targeted test and `npm run verify`, and commits only its declared files.
- The final Devpost submit action occurs only after an explicit user confirmation on the reviewed preview.
- Submission/edit deadline: 2026-07-21 17:00 Pacific / 2026-07-22 08:00 Shanghai.

---

## Plan Set

| Plan | File | Primary output |
|---|---|---|
| A | `docs/superpowers/plans/2026-07-18-trustworthy-domain-api.md` | Server-owned claim contract, scenario resolution, safety, remedy assessment, and ranking trace |
| B | `docs/superpowers/plans/2026-07-18-source-transparent-product.md` | Revision-safe intake UI, fact correction, source-aware results, privacy state, and session feedback |
| C | `docs/superpowers/plans/2026-07-18-engineering-evaluation-deployment.md` | Reproducible toolchain, limits, privacy/security, offline tests, live eval, CI, and Vercel release |
| D | `docs/superpowers/plans/2026-07-18-build-week-evidence-submission.md` | License, Build Week narrative, reports, demo script, human-input gate, and final Devpost validation |

## Frozen Cross-Plan Interfaces

Plan A owns these exports; later plans consume them without renaming:

```ts
export const CANONICAL_INCIDENTS = [
  "hotel_walk",
  "airline_delay",
  "airline_cancellation",
  "denied_boarding"
] as const;

export type CanonicalIncident = (typeof CANONICAL_INCIDENTS)[number];
export type WorkflowStatus =
  | "ready"
  | "needs_information"
  | "out_of_scope"
  | "unsupported_high_risk";

export type ScenarioId =
  | "marriott_hotel_walk"
  | "us_airline_disruption"
  | "us_denied_boarding"
  | "eu_uk_air_disruption";

export type ExtractionMode = "gpt" | "local";
export type ExtractionProvider = "openai" | "local";
export type RemedyStatus = "supported" | "conditional" | "not_applicable";

export type RawLocation = {
  city: string | null;
  airport: string | null;
  country: string | null;
};

export type AssistanceFacts = {
  refundOffered: boolean | null;
  refundAccepted: boolean | null;
  creditOffered: boolean | null;
  creditAccepted: boolean | null;
  reroutingOffered: boolean | null;
  reroutingAccepted: boolean | null;
  replacementTravelOffered: boolean | null;
  replacementTravelAccepted: boolean | null;
  lodgingOffered: boolean | null;
  lodgingAccepted: boolean | null;
  mealsOffered: boolean | null;
  mealsAccepted: boolean | null;
  groundTransportOffered: boolean | null;
  groundTransportAccepted: boolean | null;
};

export type RawClaimFacts = {
  incidentType: CanonicalIncident | null;
  providerType: "hotel" | "airline" | null;
  provider: string | null;
  brandOrProperty: string | null;
  operatingCarrier: string | null;
  origin: RawLocation;
  destination: RawLocation;
  statedReason: string | null;
  reasonCategory:
    | "crew"
    | "mechanical"
    | "oversales"
    | "weather"
    | "late_inbound_aircraft"
    | "other_controllable"
    | "other_uncontrollable"
    | null;
  userInitiatedChange: boolean | null;
  scheduledFinalArrival: string | null;
  actualFinalArrival: string | null;
  finalArrivalDelayMinutes: number | null;
  isOvernight: boolean | null;
  cancellationNoticeHours: number | null;
  assistance: AssistanceFacts;
  deniedBoardingKind: "voluntary" | "involuntary" | null;
  oversalesConfirmed: boolean | null;
  confirmedReservation: boolean | null;
  checkedInOnTime: boolean | null;
  atGateOnTime: boolean | null;
  documentsCompliant: boolean | null;
  replacementArrivalDelayMinutes: number | null;
  confirmedHotelReservation: boolean | null;
  qualifyingHotelReservation: boolean | null;
  bookingChannel: "direct" | "ota" | "portal" | null;
  loyaltyStatus: string | null;
  membershipAttached: boolean | null;
  wasWalked: boolean | null;
  replacementLodgingProvided: boolean | null;
  expenses: string[];
  evidence: string[];
  userGoal: string | null;
};

export const RAW_FACT_PATHS = [
  "incidentType", "providerType", "provider", "brandOrProperty", "operatingCarrier",
  "origin.city", "origin.airport", "origin.country",
  "destination.city", "destination.airport", "destination.country",
  "statedReason", "reasonCategory", "userInitiatedChange", "scheduledFinalArrival",
  "actualFinalArrival", "finalArrivalDelayMinutes", "isOvernight",
  "cancellationNoticeHours", "assistance.refundOffered", "assistance.refundAccepted",
  "assistance.creditOffered", "assistance.creditAccepted", "assistance.reroutingOffered",
  "assistance.reroutingAccepted", "assistance.replacementTravelOffered",
  "assistance.replacementTravelAccepted", "assistance.lodgingOffered",
  "assistance.lodgingAccepted", "assistance.mealsOffered", "assistance.mealsAccepted",
  "assistance.groundTransportOffered", "assistance.groundTransportAccepted",
  "deniedBoardingKind", "oversalesConfirmed", "confirmedReservation",
  "checkedInOnTime", "atGateOnTime", "documentsCompliant",
  "replacementArrivalDelayMinutes", "confirmedHotelReservation",
  "qualifyingHotelReservation", "bookingChannel", "loyaltyStatus", "membershipAttached",
  "wasWalked", "replacementLodgingProvided", "expenses", "evidence", "userGoal"
] as const;

export type RawFactPath = (typeof RAW_FACT_PATHS)[number];
export type RawFactValue = string | number | boolean | string[];
export type FactSource =
  | "user_correction"
  | "user_message"
  | "deterministic_extraction"
  | "openai_extraction";
export type FactProvenance = { source: FactSource; factsRevision: number };

export type FactConflict = {
  field: RawFactPath;
  candidates: Array<{
    value: RawFactValue;
    source: "deterministic_extraction" | "openai_extraction";
  }>;
};

export type ClaimState = {
  facts: RawClaimFacts;
  provenance: Partial<Record<RawFactPath, FactProvenance>>;
  revision: number;
  conflicts: FactConflict[];
  unresolvedFields: RawFactPath[];
};

export type RawFactPatch = {
  set: Partial<Record<RawFactPath, RawFactValue | null>>;
};

export type UserFactEdit = {
  set: Partial<Record<RawFactPath, RawFactValue>>;
  clear: RawFactPath[];
};

export type ExtractionMetadata =
  | {
      performed: false;
      requestedMode: ExtractionMode;
      provider: null;
      model: null;
      notRunReason: "preflight_guard" | "correction_only";
    }
  | {
      performed: true;
      requestedMode: "gpt";
      provider: "openai";
      model: "gpt-5.6-luna";
    }
  | {
      performed: true;
      requestedMode: "local";
      provider: "local";
      model: null;
    }
  | {
      performed: true;
      requestedMode: "gpt";
      provider: "local";
      model: null;
      fallbackReason: string;
    };

export type FactDisplayItem = {
  path: RawFactPath;
  label: string;
  value: RawFactValue | null;
  provenance: FactProvenance | null;
};

export type AssessmentResult = {
  status: WorkflowStatus;
  primaryScenario: ScenarioId | null;
  scenarioIds: ScenarioId[];
  factsRevision: number;
  factsUsed: FactDisplayItem[];
  missingFacts: RawFactPath[];
  legalRegimes: LegalRegime[];
  extraction: ExtractionMetadata;
  assessments: RemedyAssessment[];
  retrieval: RetrievalTrace;
  cautions: string[];
  nextActions: string[];
};

export type AnalyzeClaimRequest = {
  message: string;
  prior: ClaimState;
  correction?: UserFactEdit;
  baseRevision: number;
  requestedMode?: ExtractionMode;
  privacyAcknowledged?: boolean;
};

export type AnalyzeClaimDomainResponse = {
  baseRevision: number;
  claimState: ClaimState;
  result: AssessmentResult;
  context: ResolvedClaimContext | null;
};
```

Plan C Task 6 owns the knowledge boundary at `lib/knowledge/knowledge-contract.ts`:

```ts
export type KnowledgeSnapshot = {
  policies: readonly Policy[];
  cases: readonly Case[];
  scripts: readonly Script[];
  carrierCommitments: readonly CarrierCommitment[];
  version: string;
};

export interface KnowledgeRepository {
  load(): Promise<KnowledgeSnapshot>;
}
```

Plan C Task 6 also adds the exact non-empty `source_ids: string[]` field to canonical `Script`; each ID references one same-snapshot `Policy.policy_id` and is validated for uniqueness and referential integrity. Plan A Task 7 filters scripts against the complete unsliced applicable/conditional policy-ID set and preserves this array unchanged. Plan B Task 1 promotes cited policies omitted by display Top-K into the source-card response and rejects any orphan citation.

Plan B owns the public `AnalyzeClaimResponse` (`baseRevision`, `claimState`, and `result: AnalysisViewModel`), the workflow reducer, and UI components. Plan C may add transport/error metadata but may not alter domain eligibility. Plan D reads committed evidence only and never manufactures metrics or user inputs. `releaseSha` is the final relevant runtime commit; `evidenceHeadSha` is its evidence-only descendant and is computed for the final preview rather than written into its own commit. After `releaseSha`, the exact non-runtime whitelist is `artifacts/release-evidence.json`, `LICENSE`, `README.md`, `docs/build-week/**`, `scripts/validate-build-week-evidence.mjs`, and `tests/evidence/build-week-evidence.test.ts`; any other path forces requalification.

## Execution Order

- [ ] **Checkpoint 0:** Invoke `superpowers:using-git-worktrees`, create an isolated execution worktree from `codex/openai-build-week`, confirm `git status --short` is empty, and record the current HEAD that contains this complete plan set. Keep `0b2b730` only as the approved-spec commit, not the execution start.
- [ ] **Checkpoint 1:** Execute Plan C Task 1 only, obtaining approval before runtime/dependency installation; stop unless Node/npm preflight, data validation, typecheck, unit tests, lint, and build can run reproducibly.
- [ ] **Checkpoint 2:** Execute Plan A Tasks 1-4 in order. Until Plan C Tasks 2-5 are complete, public routes instantiate Local extraction only.
- [ ] **Checkpoint 3:** Execute Plan C Task 6, including the approved human source review, so the knowledge contract and carrier-specific records exist before remedy implementation.
- [ ] **Checkpoint 4:** Execute Plan A Tasks 5-7, then Plan C Tasks 2-5 in numeric order. The outbound redaction/allowlist and safe telemetry boundary from Task 3 must exist before Task 5 can instantiate OpenAI in any public handler; review request, privacy, failure, access, and zero-call gates together.
- [ ] **Checkpoint 5:** Execute Plan B Tasks 1-7 in order. The public UI must remain buildable after every commit and may expose GPT only through the already-private, guarded handler.
- [ ] **Checkpoint 6:** Execute Plan C Tasks 7-11. Security/privacy/offline gates pass before browser work. Task 10 builds the live-eval harness but does not yet run the qualifying live call.
- [ ] **Checkpoint 7:** Execute Plan C Task 12: commit and freeze `releaseSha`, qualify it with deterministic/CI/E2E evidence, then—with explicit authorization—run the complete live GPT-5.6 evaluation and Vercel release. A relevant change creates a new `releaseSha` and invalidates the evidence.
- [ ] **Checkpoint 8:** Execute Plan D Tasks 1-6. Reconcile every statement against `releaseSha`, Git history, and machine evidence.
- [ ] **Checkpoint 9:** Pause for Plan D Task 7 human inputs. Never infer the project name, submitter type, team acceptance, video URL, `/feedback` ID, or eligibility fields.
- [ ] **Checkpoint 10:** Execute Plan D Task 8 validation. Compute `evidenceHeadSha`, show the complete Devpost preview, obtain explicit final confirmation, submit once, and verify non-draft state plus non-null `submitted_at`.

## Specification Coverage

| Spec work package | Implementation plan task |
|---|---|
| WP1-01 | Plan A Task 1 |
| WP1-02 | Plan A Task 2 |
| WP1-03 | Plan A Task 3 |
| WP1-04 | Plan A Task 4 |
| WP1-05 | Plan A Task 5 |
| WP1-06 | Plan A Task 6 |
| WP1-07 | Plan A Task 7 |
| WP2-01 | Plan B Task 1 |
| WP2-02 | Plan B Task 2 |
| WP2-03 | Plan B Task 3 |
| WP2-04 | Plan B Task 4 |
| WP2-05 | Plan B Task 5 |
| WP2-06 | Plan B Task 6 |
| WP2-07 | Plan B Task 7 |
| WP3-01 | Plan C Task 1 |
| WP3-02 | Plan C Task 2 |
| WP3-11 | Plan C Task 3 |
| WP3-04 | Plan C Task 4 |
| WP3-03 | Plan C Task 5 |
| WP3-05 | Plan C Task 6 |
| WP3-12 | Plan C Task 7 |
| WP3-06 | Plan C Task 8 |
| WP3-07 | Plan C Task 9 |
| WP3-08 | Plan C Task 10 |
| WP3-09 | Plan C Task 11 |
| WP3-10 | Plan C Task 12 |
| WP4-04 | Plan D Task 1 |
| WP4-01 | Plan D Task 2 |
| WP4-02 | Plan D Task 3 |
| WP4-03 | Plan D Task 4 |
| WP4-05 | Plan D Task 5 |
| WP4-06 | Plan D Task 6 |
| WP4-07 | Plan D Task 7 |
| WP4-08 | Plan D Task 8 |

## Review and Rollback Rules

- Each task is reviewed against its declared interface and acceptance evidence before the next task starts.
- If a task fails review, amend that task's commit; do not stack unrelated fixes onto later tasks.
- Preserve the prior verified commit and Vercel deployment at every release checkpoint.
- Do not use destructive Git commands. Identify the exact failing SHA with `git log --oneline`, then use `git revert` on that SHA or Vercel rollback to the recorded deployment.
- A green deterministic gate never substitutes for the authorized live-model gate, and a transient upstream outage never erases deterministic evidence.
