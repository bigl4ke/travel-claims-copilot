# Engineering, Evaluation, and Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frozen four-scenario product reproducible, bounded, private by construction, securely judge-gated, testable without network access, measurably accurate on GPT-5.6, continuously verified, and safely deployable to Vercel.

**Architecture:** Transport validation, model failures, outbound privacy, access/limit controls, knowledge validation, and release evidence are independent adapters around the Plan A workflow. Normal verification is entirely offline. Live GPT evaluation and Vercel/GitHub operations are explicit external gates performed only after the runtime tree is frozen.

**Tech Stack:** Node.js 22.14.0, npm 10.9.2, Next.js 15.5.18, TypeScript 5.5.4, ESLint 8.57.1 with Airbnb/Next rules, Prettier 3.6.2, Vitest 4.1.10, Playwright 1.55.0, OpenAI Responses API with GPT-5.6 Luna, GitHub Actions, Vercel.

## Global Constraints

- Ask immediately before any dependency installation, browser download, network source check, dependency audit, GitHub write, live OpenAI call, or Vercel change. Approval for one category does not authorize another.
- Never place an API key, demo access code, private Devpost value, real user narrative, raw model response, or environment dump in a command, log, fixture, report, commit, or chat message.
- GPT-5.6 Luna is the only public model. DeepSeek remains importable compatibility code, but no public route, environment auto-selection, UI, eval, README, video, or Devpost field may activate or name it as a core path.
- Normal unit, API, build, and E2E commands deny non-loopback network access even when a real key exists in the environment.
- The public Local path remains usable without a code. GPT requires privacy acknowledgement plus a valid high-entropy server-side demo code.
- An in-memory limiter is supplemental only. Until a globally effective deployment limit is configured and verified, GPT stays judge-gated and must not be described as an unrestricted public endpoint.
- A release source may grant a carrier commitment only through an exact normalized-carrier record, applicable carrier role, and fully matched typed event/controllability/wait/overnight predicates. An absent, conflicted, or non-computable predicate can produce only `conditional`, never `supported`. The record must also carry source title/provider/URL/legal regime/authority evidence, have review age no greater than 30 days, and have a release reachability check no older than 48 hours.
- `releaseSha` means the last commit that changes runtime code, prompt, schema, model configuration, or production knowledge. `evidenceHeadSha` means a later evidence-only descendant. After `releaseSha`, only `artifacts/release-evidence.json`, `LICENSE`, `README.md`, `docs/build-week/**`, `scripts/validate-build-week-evidence.mjs`, and `tests/evidence/build-week-evidence.test.ts` may change; any other path creates a new release candidate. A tracked file may name `releaseSha`; it must not claim to contain its own self-referential `evidenceHeadSha`.
- Every task begins with a failing test or preflight, implements the smallest passing change, runs its targeted checks plus `npm run verify`, and commits only its declared files.
- Use npm and the committed lock file. Use 2-space indentation, kebab-case for new files, functional logic without mutable globals, and React components only under `src/components`.

---

## File Structure

| File | Responsibility |
|---|---|
| `.nvmrc`, `.npmrc`, `package.json`, `package-lock.json` | Exact runtime/package manager and supported scripts |
| `.prettierrc.json`, `.prettierignore`, `.eslintrc.json` | Airbnb/Next/Prettier static conventions |
| `vitest.config.ts`, `playwright.config.ts`, `tests/setup/offline.ts`, `scripts/offline-network-guard.mjs`, `scripts/run-offline-next.mjs` | Deterministic offline unit, process-egress, Next server, and Next build harnesses |
| `lib/api/request-body.ts`, `lib/api/input-limits.ts` | Byte-accurate body reading and bounded transport validation |
| `lib/api/api-error.ts`, `lib/api/api-response.ts` | Unified safe API errors and request IDs |
| `lib/model/model-error.ts` | Typed refusal, timeout, upstream, JSON, and schema failures |
| `lib/privacy/redaction.ts`, `lib/privacy/outbound-payload.ts`, `lib/privacy/safe-telemetry.ts` | Allowlisted model input, deterministic redaction, safe logs |
| `lib/access/demo-access.ts`, `lib/limits/*` | Consent, constant-time code verification, limit and budget adapters |
| `lib/knowledge/knowledge-schema.ts`, `lib/knowledge/load-knowledge.ts` | One runtime/CI knowledge validator |
| `lib/knowledge/knowledge-contract.ts`, `lib/knowledge/knowledge-repository.ts` | Frozen knowledge snapshot and repository boundary |
| `data/carrier-commitments.json`, `data/scripts.json`, `DATA_SCHEMA.md` | Carrier-specific commitments plus source-grounded script records |
| `scripts/run-e2e-rehearsals.mjs`, `evals/*` | Three-run browser evidence plus the versioned 48-case bilingual eval, scorer, and report generator |
| `.github/workflows/ci.yml` | Secret-free clean-install CI |
| `app/api/health/route.ts`, `vercel.json`, `.env.example` | Health, deployment configuration, and documented environment |
| `artifacts/release-evidence.json` | Machine-assembled evidence tied to `releaseSha` |

### Task 1: Standardize the Reproducible Toolchain (WP3-01)

**Files:**
- Create: `.nvmrc`
- Create: `.npmrc`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `tests/setup/offline.ts`
- Create: `tests/e2e/smoke.spec.ts`
- Modify: `.eslintrc.json`
- Modify: `package.json`
- Modify after approved install: `package-lock.json`

**Interfaces:** Produces the canonical commands `validate:data`, `lint`, `format:check`, `typecheck`, `test`, `test:e2e`, `build`, and `verify`.

- [ ] **Step 1: Record the failing runtime and script preflight**

Run:

```bash
node --version
npm --version
npm pkg get scripts.typecheck scripts.test:e2e scripts.verify engines packageManager
```

Expected before implementation: local Node reports `v20.11.1`, npm reports `10.2.4`, and the requested package fields are absent. Do not run an install under this runtime.

- [ ] **Step 2: Ask for runtime and dependency-install permission**

Request approval to activate/install Node `22.14.0`, npm `10.9.2`, install the exact packages below, and download Playwright Chromium. Stop this task if approval is withheld; no lock-file edit may be synthesized by hand.

```text
@playwright/test@1.55.0
@typescript-eslint/eslint-plugin@7.18.0
@typescript-eslint/parser@7.18.0
eslint-config-airbnb-base@15.0.0
eslint-config-airbnb-typescript@18.0.0
eslint-config-prettier@9.1.0
eslint-plugin-import@2.31.0
eslint-plugin-jsx-a11y@6.10.2
eslint-plugin-react@7.37.5
eslint-plugin-react-hooks@5.2.0
prettier@3.6.2
tsx@4.20.3
```

Use `airbnb-base` plus `airbnb-typescript/base` for Airbnb's base and TypeScript rules. Next 15's `next/core-web-vitals` owns React, JSX accessibility, and Hooks rules and requires `eslint-plugin-react-hooks@5.2.0`; do not combine it with full `eslint-config-airbnb@19.0.4`, whose Hooks 4.x peer range is incompatible. Never bypass this boundary with `--force` or `--legacy-peer-deps`.

- [ ] **Step 3: Pin runtime, scripts, and formatting rules**

Set `.nvmrc` to `22.14.0`, `.npmrc` to the following, and `package.json.engines`/`packageManager` to exact values:

```ini
engine-strict=true
fund=false
audit=false
```

```json
{
  "engines": { "node": "22.14.0", "npm": "10.9.2" },
  "packageManager": "npm@10.9.2",
  "scripts": {
    "validate:data": "node scripts/validate-data.mjs",
    "lint": "eslint . --ext .js,.mjs,.ts,.tsx --max-warnings 0",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --config vitest.config.ts",
    "test:e2e": "playwright test",
    "build": "next build",
    "validate:evidence": "node scripts/validate-build-week-evidence.mjs --scope all",
    "verify": "npm run validate:data && npm run lint && npm run typecheck && npm test && npm run build"
  }
}
```

Use this exact lint/format baseline:

```json
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "project": "./tsconfig.json" },
  "extends": [
    "airbnb-base",
    "airbnb-typescript/base",
    "next/core-web-vitals",
    "prettier"
  ],
  "rules": {
    "camelcase": "off",
    "import/extensions": ["error", "ignorePackages", { "js": "never", "jsx": "never", "ts": "never", "tsx": "never" }],
    "import/prefer-default-export": "off",
    "no-use-before-define": "off",
    "@typescript-eslint/no-use-before-define": "off",
    "react/function-component-definition": "off",
    "react/jsx-props-no-spreading": "off",
    "react/react-in-jsx-scope": "off",
    "react/require-default-props": "off"
  }
}
```

```json
{
  "tabWidth": 2,
  "useTabs": false,
  "singleQuote": false,
  "semi": true,
  "trailingComma": "none",
  "printWidth": 100
}
```

`.prettierignore` contains `.next`, `node_modules`, `coverage`, `playwright-report`, `test-results`, `artifacts`, and `package-lock.json`; generated evidence is validated by its producer rather than reformatted.

- [ ] **Step 4: Install exact dependencies and browser only after approval**

Use Node `22.14.0`, then run:

```bash
npm install --save-exact --save-dev @playwright/test@1.55.0 @typescript-eslint/eslint-plugin@7.18.0 @typescript-eslint/parser@7.18.0 eslint-config-airbnb-base@15.0.0 eslint-config-airbnb-typescript@18.0.0 eslint-config-prettier@9.1.0 eslint-plugin-import@2.31.0 eslint-plugin-jsx-a11y@6.10.2 eslint-plugin-react@7.37.5 eslint-plugin-react-hooks@5.2.0 prettier@3.6.2 tsx@4.20.3 typescript@5.5.4
```

Pin TypeScript exactly at `5.5.4`: `@typescript-eslint/typescript-estree@7.18.0` supports TypeScript `>=4.7.4 <5.6.0`, and the approved Airbnb TypeScript configuration requires the 7.x parser/plugin line. Do not widen this pin without requalifying the lint architecture.

Then run:

```bash
npx playwright install chromium
```

Expected: `package-lock.json` changes through npm; `npm ci` completes under the pinned runtime.

- [ ] **Step 5: Add deterministic Vitest and Playwright configuration**

Use these configurations and create the referenced fail-closed offline setup in the same commit; Task 8 adds proof tests and the Playwright request guard:

```ts
// vitest.config.ts
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup/offline.ts"],
    restoreMocks: true,
    exclude: [...configDefaults.exclude, "tests/e2e/**", ".next/**"]
  }
});
```

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["json", { outputFile: "test-results/playwright-results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI
  }
});
```

```ts
// tests/setup/offline.ts
import { afterEach, beforeEach, vi } from "vitest";

const originalFetch = globalThis.fetch;
const modelEnvKeys = [
  "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_INTAKE_MODEL",
  "DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_INTAKE_MODEL", "LLM_PROVIDER"
] as const;

export function assertOfflineUrl(input: string | URL | Request): void {
  const raw = input instanceof Request ? input.url : input.toString();
  const url = new URL(raw);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(`Offline test blocked non-loopback request to ${url.origin}`);
  }
}

beforeEach(() => {
  for (const key of modelEnvKeys) vi.stubEnv(key, "");
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assertOfflineUrl(input);
    return originalFetch(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
```

```ts
// tests/e2e/smoke.spec.ts
import { expect, test } from "@playwright/test";

test("renders the existing application", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toBeVisible();
});
```

- [ ] **Step 6: Prove every command exists and the lock is reproducible**

Run `npm ci`, then run each canonical script separately and `npm run verify`. Expected: every command exits 0 and `npm ci` does not modify `package-lock.json`.

- [ ] **Step 7: Commit the toolchain**

```bash
git add .nvmrc .npmrc .prettierrc.json .prettierignore .eslintrc.json vitest.config.ts playwright.config.ts tests/setup/offline.ts tests/e2e/smoke.spec.ts package.json package-lock.json
git commit -m "build: standardize the verification toolchain"
```

### Task 2: Enforce Request and Model-Output Limits (WP3-02)

**Files:**
- Create: `lib/api/api-error.ts`
- Create: `lib/api/request-body.ts`
- Create: `lib/api/input-limits.ts`
- Create: `tests/api/request-limits.test.ts`
- Create: `tests/model/openai-output-limits.test.ts`
- Modify: `lib/llm.ts`
- Modify: `lib/domain/raw-fact-schema.ts`
- Modify: `lib/api/analyze-contract.ts`
- Modify: `app/api/intake/route.ts`
- Modify: `app/api/analyze/route.ts`

**Interfaces:** Produces `ApiFault`, `readJsonBody()`, `parseAnalyzeRequest()`, and the hard constants below. Consumes Plan A raw-fact schemas.

- [ ] **Step 1: Write failing byte, semantic, zero-call, and adapter snapshots**

Test exactly: non-JSON is 415; invalid JSON is 400; 32,769 streamed bytes are 413 even with a false small `Content-Length`; 4,001 Unicode code points are 422; 257-character ordinary fields, 501-character `userGoal`, 21-item arrays, and 257-character items are 422; every rejected request makes zero extractor calls; OpenAI sends `max_output_tokens: 1200`; oversized or schema-invalid model content never merges. Add the canonical request-mode matrix: an initial request requires a nonblank `message` and no `correction`; a correction-only request requires `message: ""` plus at least one valid non-null `correction.set` value or `correction.clear` path; null in user `set` is 422 and only model `RawFactPatch` null remains a no-op; empty message without an effective correction is 422; nonblank message plus correction is 422; a valid correction-only request invokes neither Local nor GPT extraction. Body, collection, path, and string limits still apply to correction-only requests. Where the canonical response parser sees Plan A's discriminated `ExtractionMetadata`, reject every illegal combination fail closed: `performed: false` requires `provider: null`, `model: null`, no fallback reason, and `notRunReason: "preflight_guard" | "correction_only"`; a validated correction-only request must emit `correction_only`, while a guarded initial request emits `preflight_guard`. Performed OpenAI requires requested mode `gpt`, `provider: "openai"`, `model: "gpt-5.6-luna"`, and no fallback reason; performed direct Local requires requested mode `local`, `provider: "local"`, `model: null`, and no fallback reason; performed GPT-to-Local fallback requires requested mode `gpt`, `provider: "local"`, `model: null`, and a nonblank canonical `fallbackReason`. Every performed arm forbids `notRunReason`. No invalid metadata may be coerced, defaulted, logged as success, or merged into prior state.

- [ ] **Step 2: Run the tests and observe unbounded parsing fail**

Run: `npm test -- tests/api/request-limits.test.ts tests/model/openai-output-limits.test.ts`

Expected: FAIL because routes call `request.json()` and the OpenAI request has no output-token bound.

- [ ] **Step 3: Implement the byte-accurate reader**

```ts
export const INPUT_LIMITS = {
  bodyBytes: 32 * 1024,
  messageCodePoints: 4_000,
  ordinaryStringCodePoints: 256,
  userGoalCodePoints: 500,
  collectionItems: 20,
  collectionItemCodePoints: 256,
  modelOutputTokens: 1_200,
  modelOutputBytes: 64 * 1024
} as const;

export async function readJsonBody(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw new ApiFault("unsupported_media_type", 415, false);
  }
  if (!request.body) throw new ApiFault("invalid_json", 400, false);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > INPUT_LIMITS.bodyBytes) {
      await reader.cancel();
      throw new ApiFault("request_too_large", 413, false);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown;
  } catch {
    throw new ApiFault("invalid_json", 400, false);
  }
}
```

- [ ] **Step 4: Add one bounded request parser and strict output validation**

`parseAnalyzeRequest()` copies allowlisted fields only, counts Unicode with `[...value].length`, validates array counts/items, and delegates raw facts/model patches to Plan A schemas. It returns the discriminated initial/correction-only request contract above: trim only to test initial-message blankness without rewriting the user's bounded text; require correction `set`/`clear` to contain at least one validated path operation; reject null user-set values, overlap between `set` and `clear`, and duplicate clears; and never treat an all-empty patch as a correction. Add `maxOutputTokens` to `StructuredOutputRequest`; `OpenAIResponsesClient` always serializes it as `max_output_tokens: 1200`. Reject response text above 64 KB before `JSON.parse`, then parse through `parseRawFactPatch()` before merge.

- [ ] **Step 5: Route both endpoints through the bounded reader**

Read and validate the body before choosing an extractor or loading knowledge. Initial requests choose the authorized extractor only after validation; correction-only requests apply the validated patch deterministically and skip both extractors regardless of requested mode or available key. Preserve ordinary missing information as a 200 workflow result; reserve 422 for semantic constraint violations or model refusal.

- [ ] **Step 6: Verify zero-cost rejection and commit**

Run: `npm test -- tests/api/request-limits.test.ts tests/model/openai-output-limits.test.ts && npm run verify`

```bash
git add lib/api/api-error.ts lib/api/request-body.ts lib/api/input-limits.ts lib/llm.ts lib/domain/raw-fact-schema.ts lib/api/analyze-contract.ts app/api/intake/route.ts app/api/analyze/route.ts tests/api/request-limits.test.ts tests/model/openai-output-limits.test.ts
git commit -m "feat: bound claim and model payloads"
```

### Task 3: Enforce Outbound Privacy and Safe Telemetry (WP3-11)

**Files:**
- Create: `lib/privacy/redaction.ts`
- Create: `lib/privacy/outbound-payload.ts`
- Create: `lib/privacy/safe-telemetry.ts`
- Create: `tests/privacy/redaction.test.ts`
- Create: `tests/privacy/outbound-payload.test.ts`
- Create: `tests/privacy/safe-telemetry.test.ts`
- Modify: `lib/model/raw-fact-extractor.ts`
- Modify: `lib/llm.ts`
- Modify: `lib/claim-workflow.ts`

**Interfaces:** Consumes Plan A `buildResolutionFacts()`; produces `redactNarrative()`, `buildOutboundExtractionInput()`, `SafeTelemetryEvent`, and `TelemetrySink`.

- [ ] **Step 1: Write failing PII, allowlist, logger-spy, and exception tests**

Use synthetic identifiers only. Assert redaction removes emails, phone numbers, card-like payment numbers, and labelled booking/ticket/membership/reservation identifiers in English and Chinese, while preserving `CDG`, `JFK`, dates, delay minutes, and flight labels. Snapshot the outbound object and prove it has no transcript, derived region, assessment, expenses, evidence, `userGoal`, feedback, code, or headers. Seed an old carrier/route value whose path is unresolved and assert the outbound prior field is null while its path remains in `unresolvedFields`; a conflicting stored value must never be sent as co-reference truth. Spy on success/fallback/exception/preflight logs and prove the raw message and complete fact object are absent. A preflight-guarded or correction-only request must emit `extractionPerformed: false`, `provider: null`, `model: null`, no fallback reason, and its exact `notRunReason`; Local/OpenAI performed arms must use their exact requested-mode/provider/model/fallback combination. Compile-time fixtures plus a runtime factory test reject every mixed arm, so not-run telemetry never invents a provider.

- [ ] **Step 2: Run tests and confirm the existing serialized input fails**

Run: `npm test -- tests/privacy`

Expected: FAIL because no deterministic redactor or telemetry boundary exists.

- [ ] **Step 3: Implement deterministic redaction and the only outbound shape**

```ts
export type OutboundExtractionPayload = {
  message: string;
  prior: {
    incidentType: CanonicalIncident | null;
    provider: string | null;
    operatingCarrier: string | null;
    origin: Pick<RawLocation, "city" | "airport" | "country">;
    destination: Pick<RawLocation, "city" | "airport" | "country">;
    reasonCategory: RawClaimFacts["reasonCategory"];
    finalArrivalDelayMinutes: number | null;
    deniedBoardingKind: RawClaimFacts["deniedBoardingKind"];
  };
  unresolvedFields: RawFactPath[];
};
```

Build this object property-by-property after redacting the current message. Derive every `prior` field from `buildResolutionFacts(claimState)`, never `claimState.facts`, so unresolved stored values are null/empty in the outbound copy. Do not accept `Record<string, unknown>` as input to the builder. Use labelled-pattern redaction before generic email/phone/payment patterns; replacement tokens are `[REDACTED_EMAIL]`, `[REDACTED_PHONE]`, `[REDACTED_PAYMENT]`, and `[REDACTED_IDENTIFIER]`.

- [ ] **Step 4: Add a closed telemetry schema**

```ts
export type SafeExtractionTelemetry =
  | {
      extractionPerformed: false;
      requestedMode: "local" | "gpt";
      provider: null;
      model: null;
      notRunReason: "preflight_guard" | "correction_only";
      fallbackReason?: never;
    }
  | {
      extractionPerformed: true;
      requestedMode: "local";
      provider: "local";
      model: null;
      notRunReason?: never;
      fallbackReason?: never;
    }
  | {
      extractionPerformed: true;
      requestedMode: "gpt";
      provider: "openai";
      model: "gpt-5.6-luna";
      notRunReason?: never;
      fallbackReason?: never;
    }
  | {
      extractionPerformed: true;
      requestedMode: "gpt";
      provider: "local";
      model: null;
      notRunReason?: never;
      fallbackReason: string;
    };

export type SafeTelemetryEvent = SafeExtractionTelemetry & {
  requestId: string;
  category: "success" | "fallback" | "refusal" | "invalid_request" | "rate_limited" | "upstream_failure";
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  workflowStatus?: WorkflowStatus;
};

export interface TelemetrySink {
  record(event: SafeTelemetryEvent): void;
}
```

Only this discriminated type crosses the logger boundary. Construct it through a closed factory that rejects impossible provider/model/performed/not-run combinations before calling the sink. Error objects are converted to a fixed category before recording. Keep OpenAI `store: false` in a request snapshot test.

- [ ] **Step 5: Verify privacy paths and commit**

Run: `npm test -- tests/privacy tests/model/raw-fact-extractor.test.ts && npm run verify`

```bash
git add lib/privacy/redaction.ts lib/privacy/outbound-payload.ts lib/privacy/safe-telemetry.ts lib/model/raw-fact-extractor.ts lib/llm.ts lib/claim-workflow.ts tests/privacy/redaction.test.ts tests/privacy/outbound-payload.test.ts tests/privacy/safe-telemetry.test.ts
git commit -m "feat: minimize model data and telemetry"
```

### Task 4: Implement Unified API and Model Failures (WP3-04)

**Files:**
- Create: `lib/api/api-response.ts`
- Create: `lib/model/model-error.ts`
- Create: `tests/api/error-contract.test.ts`
- Create: `tests/model/model-failures.test.ts`
- Modify: `lib/api/api-error.ts`
- Modify: `lib/llm.ts`
- Modify: `lib/model/raw-fact-extractor.ts`
- Modify: `lib/api/analyze-handler.ts`
- Modify: `app/api/intake/route.ts`
- Modify: `app/api/analyze/route.ts`

**Interfaces:** Produces `ApiErrorCode`, `ApiErrorEnvelope`, `ModelFailure`, `classifyModelFailure()`, `toApiErrorResponse()`, and `withRequestId()`.

- [ ] **Step 1: Write failing status and fallback matrix tests**

Assert 400 invalid JSON, 401 invalid/missing GPT code, 413 body, 415 media, 422 semantic/refusal, 429 rate/concurrency/budget, 502 invalid upstream content without safe fallback, and 504 timeout without safe fallback. Assert timeout, upstream 429/5xx, invalid JSON, and schema failure use Local fallback when it succeeds; refusal never falls back; all errors have exactly `{ error: { code, message, requestId, retryable } }` and no stack.

- [ ] **Step 2: Run tests and confirm free-form errors fail**

Run: `npm test -- tests/api/error-contract.test.ts tests/model/model-failures.test.ts`

- [ ] **Step 3: Add closed failure unions and mappings**

```ts
export type ModelFailureCode =
  | "model_refusal"
  | "model_timeout"
  | "upstream_rate_limited"
  | "upstream_unavailable"
  | "invalid_model_json"
  | "invalid_model_schema";

export class ModelFailure extends Error {
  constructor(
    readonly code: ModelFailureCode,
    readonly retryable: boolean,
    readonly safeFallbackEligible: boolean
  ) {
    super(code);
    this.name = "ModelFailure";
  }
}
```

Map OpenAI refusal content to non-retryable `model_refusal`; `AbortError` to timeout; HTTP 429 to rate-limited; HTTP 5xx to unavailable; JSON parse and patch parse to their distinct classes. Never include upstream response bodies in thrown messages or logs.

- [ ] **Step 4: Centralize route responses and fallback**

Generate `requestId` with `crypto.randomUUID()`. `toApiErrorResponse()` accepts known faults only and returns fixed public messages. Unknown errors become retryable 502 `upstream_failure`; stack and cause remain server-local and are not logged through the safe sink. The handler catches `ModelFailure`: refusal returns 422, eligible failures invoke Local once, and a failed Local fallback maps to 502/504.

- [ ] **Step 5: Verify matrix, routes, and commit**

Run: `npm test -- tests/api/error-contract.test.ts tests/model/model-failures.test.ts && npm run verify`

```bash
git add lib/api/api-error.ts lib/api/api-response.ts lib/model/model-error.ts lib/llm.ts lib/model/raw-fact-extractor.ts lib/api/analyze-handler.ts app/api/intake/route.ts app/api/analyze/route.ts tests/api/error-contract.test.ts tests/model/model-failures.test.ts
git commit -m "feat: classify safe analysis failures"
```

### Task 5: Enforce Mode, Consent, Access, Limits, and Budget (WP3-03)

**Files:**
- Create: `lib/access/demo-access.ts`
- Create: `lib/limits/rate-limiter.ts`
- Create: `lib/limits/concurrency-limiter.ts`
- Create: `lib/limits/gpt-request-guard.ts`
- Create: `tests/access/demo-access.test.ts`
- Create: `tests/limits/gpt-request-guard.test.ts`
- Modify: `lib/api/analyze-contract.ts`
- Modify: `lib/api/analyze-handler.ts`
- Modify: `lib/llm.ts`
- Modify: `app/api/intake/route.ts`
- Modify: `app/api/analyze/route.ts`

**Interfaces:** Produces `verifyDemoAccess()`, `TrustedClientIdentity`, `RateLimiter`, `ConcurrencyLimiter`, `BudgetGate`, and `guardGptRequest()`.

- [ ] **Step 1: Write failing access and no-call tests**

Assert: missing mode defaults Local; Local ignores model/provider environment and makes zero calls; GPT without consent or code makes zero calls; invalid code is 401; DeepSeek-only/mixed environment never selects DeepSeek; minute burst 11 and hourly request 61 return 429; a third concurrent request returns 429; failed-code attempts are limited; every acquired lease releases in `finally`; unverified global control keeps GPT judge-gated. Add a correction-only case with `requestedMode: "gpt"` and a valid patch: it must call neither `guardGptRequest()` nor access/rate/concurrency/budget/model adapters, must take Task 2's deterministic correction branch, and must return extraction metadata with `performed: false`, null provider/model, and `notRunReason: "correction_only"`.

- [ ] **Step 2: Run the guard tests and confirm environment auto-selection fails**

Run: `npm test -- tests/access/demo-access.test.ts tests/limits/gpt-request-guard.test.ts`

- [ ] **Step 3: Verify access codes in constant time**

Hash both the supplied and configured UTF-8 values with SHA-256, then use `timingSafeEqual` on the fixed-length digests. Reject absent configured code and absent/false consent before client creation. The browser sends the code only in `x-demo-access-code`; routes never echo it.

- [ ] **Step 4: Implement injected limit adapters**

```ts
export interface RateLimiter {
  consume(input: {
    key: string;
    scope: "gpt_minute" | "gpt_hour" | "failed_access";
    limit: number;
    windowMs: number;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

export interface ConcurrencyLimiter {
  acquire(key: string, limit: 2): Promise<null | { release(): Promise<void> }>;
}

export interface BudgetGate {
  check(): Promise<{ allowed: boolean; reason?: "application_budget" | "global_limit_unverified" }>;
}

export type TrustedClientIdentity = {
  key: string;
  source: "verified_host_metadata" | "local_test";
  globallyEnforceable: boolean;
};

export interface TrustedClientIdentityResolver {
  resolve(request: Request): TrustedClientIdentity;
}
```

`guardGptRequest()` checks consent, access, failed-attempt limit, global-control/budget state, 10/minute, 60/hour, and 2 concurrent in that order. The analyze handler must branch on Task 2's validated request kind before inspecting `requestedMode`; correction-only returns from the deterministic correction path before `guardGptRequest()` or any limiter/model construction. Client identity comes from a deployment adapter that reads only hosting metadata documented as trusted; arbitrary `x-forwarded-for` input is not accepted. The key is a server-side SHA-256 digest of the trusted address, never the raw address in logs. A memory adapter exists for local defense/tests, returns `globallyEnforceable: false`, and is explicitly non-release-satisfying.

- [ ] **Step 5: Remove public provider auto-selection**

Public handlers instantiate only `OpenAIResponsesClient` for GPT and Local extraction otherwise. Keep `DeepSeekChatCompletionsClient` and its direct factory exports for compatibility tests, but `LLM_PROVIDER`, `DEEPSEEK_*`, or an OpenAI-compatible base URL cannot select it through a public request.

- [ ] **Step 6: Verify guards and commit**

Run: `npm test -- tests/access tests/limits tests/model/model-failures.test.ts && npm run verify`

```bash
git add lib/access/demo-access.ts lib/limits/rate-limiter.ts lib/limits/concurrency-limiter.ts lib/limits/gpt-request-guard.ts lib/api/analyze-contract.ts lib/api/analyze-handler.ts lib/llm.ts app/api/intake/route.ts app/api/analyze/route.ts tests/access/demo-access.test.ts tests/limits/gpt-request-guard.test.ts
git commit -m "feat: guard controlled GPT extraction"
```

### Task 6: Validate Knowledge and Carrier-Specific Sources (WP3-05)

**Files:**
- Create: `lib/knowledge/knowledge-schema.ts`
- Create: `lib/knowledge/load-knowledge.ts`
- Create: `lib/knowledge/knowledge-contract.ts`
- Create: `lib/knowledge/knowledge-repository.ts`
- Create: `data/carrier-commitments.json`
- Create: `scripts/validate-data.ts`
- Create: `scripts/check-source-reachability.mjs`
- Create: `tests/fixtures/knowledge/invalid-records.ts`
- Create: `tests/knowledge/knowledge-schema.test.ts`
- Create: `tests/knowledge/carrier-commitments.test.ts`
- Create: `docs/build-week/SOURCE_REVIEW.md`
- Delete: `scripts/validate-data.mjs`
- Modify: `package.json`
- Modify: `lib/types.ts`
- Modify: `data/scripts.json`
- Modify: `data/policies.json`
- Modify: `DATA_SCHEMA.md`

**Interfaces:** Produces `CarrierCommitment`, the canonical non-empty `Script.source_ids` policy-reference field, `KnowledgeSnapshot`, `parseKnowledgeSnapshot()`, and `loadKnowledgeSnapshot()` for Plan A Tasks 5-7.

- [ ] **Step 1: Write an invalid-fixture and predicate matrix before changing data**

Reject missing fields; duplicate IDs; invalid enum/array/HTTPS/date; future or malformed dates; stale critical sources; unapproved cases without notes; approved unknown incidents; duplicate community URLs; unlabeled synthetic cases; synthetic cases ranked as real; umbrella dashboard remedies without a carrier record; unknown carrier; carrier alias instead of normalized carrier; wrong carrier role; missing source title/provider/legal regime/authority; a commitment remedy absent from its allowed enum; free-form eligibility strings in place of typed predicates; unknown predicate field/operator; a non-positive/non-integer wait threshold; and a `committed: true` remedy without both event and controllability predicates. For scripts, also reject a missing or empty `source_ids`, more than eight IDs, duplicate IDs, an ID absent from the same snapshot's `policies[].policy_id`, or a carrier-commitment/case/script ID masquerading as a policy ID. Policy, commitment, case, and script identifiers must be disjoint across namespaces so a citation can never resolve ambiguously. Add tri-state fixtures proving an absent or non-computable wait, overnight, event, or controllability value is `missing` and can yield only `conditional`, never `supported`. Add one valid script that cites a policy outside the display Top-K so later plans can prove citation promotion without changing applicability.

- [ ] **Step 2: Define the exact carrier record**

```ts
export type CarrierCommitmentPredicate =
  | {
      kind: "event";
      field: "incidentType";
      operator: "one_of";
      values: Array<"airline_delay" | "airline_cancellation">;
    }
  | {
      kind: "controllability";
      field: "controllability";
      operator: "equals";
      value: "controllable";
    }
  | {
      kind: "minimum_wait_minutes";
      field: "waitMinutes";
      operator: "at_least";
      value: number;
    }
  | {
      kind: "overnight";
      field: "isOvernight";
      operator: "equals";
      value: true;
    };

export type CarrierCommitment = {
  commitmentId: string;
  normalizedCarrier: string;
  applicableCarrierRole: "operating_carrier";
  sourceTitle: string;
  sourceProvider: string;
  sourceUrl: string;
  sourceType: "official_dashboard" | "official_policy";
  legalRegime: "US_AIRLINE_COMMITMENT";
  authority: "medium";
  lastChecked: string;
  reviewerNote: string;
  remedies: Array<{
    remedyId: "us_rerouting" | "us_meal" | "us_hotel" | "us_ground_transport";
    committed: boolean;
    predicates: CarrierCommitmentPredicate[];
    displayConditions: string[];
    rights: string[];
  }>;
};

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

Add the exact required field `source_ids: string[]` to the existing `Script` type and document it in `DATA_SCHEMA.md`. In this release every value is a policy ID, not a case, script, or carrier-commitment ID. After all four record collections parse, the validator first proves their identifier namespaces are pairwise disjoint, then enforces 1..8 unique script source IDs and resolves every value against the same snapshot's unique `policy_id` registry. `data/scripts.json` assigns reviewed policy IDs to every script; no mapper or ranker may synthesize an empty or guessed source list.

Production JSON otherwise uses snake-case equivalents. Runtime parsing converts carrier records once. `normalized_carrier` must equal the provider registry's canonical name; a global policy's `applicable_providers` list cannot substitute for a record. `display_conditions` and `rights` are evidence copy only and never determine eligibility. Plan A maps the matched record to `ProviderCommitmentEvidence` exactly as follows: `sourceTitle`, `sourceProvider`, `sourceUrl`, `sourceType`, `legalRegime`, `authority`, and `applicableCarrierRole` copy directly; `lastChecked` becomes `sourceLastChecked`; and remedy `displayConditions`/`rights` become evidence `conditions`/`rights`. Plan B assigns the presentation category `provider_commitment` without rewriting the underlying official source type. The evaluator resolves each typed predicate to `matched`, `missing`, or `excluded`: event reads the resolved incident; controllability reads the deterministically derived controllability; overnight reads the explicit overnight fact; minimum wait reads an explicit, provenance-bearing wait duration and must never substitute final-arrival delay. If that wait value is not present in the frozen fact contract, the predicate is `missing`. Any `missing` predicate forces `conditional`; any `excluded` predicate makes that commitment unavailable; `supported` requires every predicate matched plus exact carrier/role and freshness checks. `version` is the SHA-256 digest of canonicalized validated JSON content, including script source IDs, not a hand-edited label. `load()` returns newly frozen arrays/records so callers cannot mutate shared state.

- [ ] **Step 3: Implement one runtime/CLI parser and loader**

Move every current script rule into pure TypeScript parser functions, add URL/date/freshness/provider-applicability rules and the post-parse script-to-policy reference-integrity pass, and have both `loadKnowledgeSnapshot()` and `scripts/validate-data.ts` call them. Change `package.json` to `"validate:data": "tsx scripts/validate-data.ts"` in this task. The loader returns frozen arrays and rejects the whole snapshot on any error; it never silently drops a bad record. Tests assert the runtime loader and CLI reject the same unknown, duplicate, empty, and wrong-namespace script source IDs.

- [ ] **Step 4: Ask for network approval and perform the human source review**

Review each critical official URL from its canonical page. For DOT commitments, record United remedy booleans, typed predicates, display conditions, rights, source title, source provider, source URL, `US_AIRLINE_COMMITMENT`, `medium` authority, and the applicable operating-carrier role only after the official carrier-specific view proves each value. If the page cannot prove a remedy or predicate, set `committed: false` or omit that remedy; never infer from the umbrella dashboard summary. If the review cannot be completed, leave no production United record and stop the Plan A Task 5 production gate rather than guessing.

Update `SOURCE_REVIEW.md` with source ID, exact title/provider/URL, legal regime, authority, reviewer, UTC review time, applicable carrier/role, each observed typed predicate, display conditions/rights, script IDs grounded by that source, the mapping rationale, and reachability result. Use `scripts/check-source-reachability.mjs` only with approval and within 48 hours of release.

- [ ] **Step 5: Remove the generalized dashboard claim**

Change `dot_airline_cancellation_delay_dashboard` so it establishes regulator context only; per-carrier care comes exclusively from `carrier-commitments.json`. Unit tests may use `verifiedUnitedCommitmentFixture()` with explicit fixture provenance, but a production `supported` result requires the reviewed production record.

- [ ] **Step 6: Verify data and commit reviewed records**

Run: `npm test -- tests/knowledge && npm run validate:data && npm run verify`

Expected: invalid and tri-state predicate matrices PASS; all production data PASS; every script has 1..8 unique, resolvable policy IDs; the unknown/wrong-namespace reference fixtures fail closed; any `supported` United care result names the exact record, source title/provider/URL/legal regime/authority/role, and `lastChecked` date; missing or non-computable predicate inputs remain `conditional`.

```bash
git add lib/knowledge/knowledge-contract.ts lib/knowledge/knowledge-repository.ts lib/knowledge/knowledge-schema.ts lib/knowledge/load-knowledge.ts lib/types.ts data/carrier-commitments.json data/policies.json data/scripts.json DATA_SCHEMA.md scripts/validate-data.ts scripts/check-source-reachability.mjs tests/fixtures/knowledge/invalid-records.ts tests/knowledge/knowledge-schema.test.ts tests/knowledge/carrier-commitments.test.ts docs/build-week/SOURCE_REVIEW.md package.json
git rm scripts/validate-data.mjs
git commit -m "feat: validate carrier-specific knowledge"
```

### Task 7: Complete Security and Repository Hygiene (WP3-12)

**Files:**
- Create: `next.config.mjs`
- Create: `scripts/scan-secrets.mjs`
- Create: `tests/security/headers.test.ts`
- Create: `tests/security/secret-scan.test.ts`
- Create: `docs/build-week/SECURITY_CHECK.md`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `app/api/intake/route.ts`
- Modify: `app/api/analyze/route.ts`
- Remove from Git index: `.DS_Store`

**Interfaces:** Produces the static security-header policy and offline `npm run scan:secrets` gate.

- [ ] **Step 1: Write failing header, error-leak, and tracked-artifact tests**

Assert JSON-only POST routes return 415 for other media; all API responses use `Cache-Control: no-store`; browser responses include `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, and `X-Frame-Options: DENY`; production errors omit stack/cause; `git ls-files` contains no `.DS_Store`, `.env*` secret file, build output, or coverage output.

- [ ] **Step 2: Add safe headers and repository rules**

Set a server-only CSP allowing self, required Next inline script/style behavior, `data:` images, and same-origin connections; deny objects, frames, base-URI changes, and form actions outside self. Add `.DS_Store`, `.env*` except `.env.example`, `.next`, `coverage`, `playwright-report`, `test-results`, `.release`, and live-eval raw responses to `.gitignore`. Remove only the tracked `.DS_Store` index entry; preserve the local file.

- [ ] **Step 3: Add a deterministic tracked-file secret scan**

`scripts/scan-secrets.mjs` reads `git ls-files -z`, skips approved synthetic fixtures, and rejects private-key headers, common live-token prefixes, Authorization bearer literals, and high-confidence assignments to key/secret/password fields. Tests contain only segmented synthetic patterns so the test suite does not resemble a live credential. Add `scan:secrets` to `package.json` and to `verify` before build.

- [ ] **Step 4: Ask for network approval before dependency audit**

After approval run `npm audit --audit-level=high`. Record UTC time, lock hash, counts, and disposition of every high/critical finding in `SECURITY_CHECK.md`; do not run an automatic force upgrade. A high/critical finding without an approved explanation blocks release.

- [ ] **Step 5: Verify and commit hygiene**

Run: `npm test -- tests/security && npm run scan:secrets && npm run verify`

```bash
git add next.config.mjs .gitignore package.json scripts/scan-secrets.mjs app/api/intake/route.ts app/api/analyze/route.ts tests/security/headers.test.ts tests/security/secret-scan.test.ts docs/build-week/SECURITY_CHECK.md
git rm --cached .DS_Store
git commit -m "chore: harden release security gates"
```

### Task 8: Prove All Normal Tests Stay Offline (WP3-06)

**Files:**
- Modify: `tests/setup/offline.ts`
- Create: `scripts/offline-network-guard.mjs`
- Create: `scripts/run-offline-next.mjs`
- Create: `tests/e2e/offline-test.ts`
- Create: `tests/offline/offline-network-guard-probe.mjs`
- Create: `tests/offline/offline-network-guard.test.ts`
- Create: `tests/offline/offline-next-runner.test.ts`
- Create: `tests/offline/no-live-network.test.ts`
- Create: `tests/offline/no-live-key.test.ts`
- Modify: `lib/llm.ts`
- Modify: `vitest.config.ts`
- Modify: `playwright.config.ts`
- Modify: `tests/e2e/source-transparency.spec.ts`
- Modify: `tests/e2e/synthetic-sources.spec.ts`
- Modify: `tests/e2e/fact-review.spec.ts`
- Modify: `tests/e2e/assessment-explanation.spec.ts`
- Modify: `tests/e2e/model-privacy.spec.ts`
- Modify: `tests/e2e/feedback.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `package.json`

**Interfaces:** Produces `assertOfflineUrl()`, the preloaded process-wide egress guard, `createOfflineNextInvocation()`, the custom Playwright `test`/`expect` fixture, and the `dev:offline`, `build:offline`, and `test:offline` process gates.

- [ ] **Step 1: Write failing process-gate and zero-call tests with sentinel keys**

Pass non-secret sentinels for every model environment entry into `createOfflineNextInvocation("build", parentEnv)`. Assert the child environment omits every model key/routing value, sets `NEXT_TELEMETRY_DISABLED=1` and `TEST_OFFLINE=1`, replaces inherited `NODE_OPTIONS` with the exact offline-guard `--import`, launches `process.execPath` plus the Next CLI with `shell: false`, and rejects modes other than `dev`/`build`. Scan the model adapter and `.env.example` key literals so any future model credential/routing variable absent from `MODEL_ENV_KEYS` fails this contract test. Spawn `tests/offline/offline-network-guard-probe.mjs` as a real child with that environment: separate probe modes must prove non-loopback global `fetch`, `http.request`/`http.get`, `https.request`/`https.get`, and `net.connect`/`net.createConnection` throw `OfflineNetworkError` before DNS/socket use, while an ephemeral `127.0.0.1` HTTP/TCP server remains reachable. With `TEST_OFFLINE=1` and `OPENAI_API_KEY=offline-sentinel`, instantiate each external model adapter, spy on its injected fetcher, and assert the adapter fails before the fetcher is called.

- [ ] **Step 2: Add the server/build subprocess gate**

Create `scripts/offline-network-guard.mjs` with Node standard library only. On import it wraps global `fetch`, `node:http` request/get, `node:https` request/get, and `node:net` connect/createConnection; accepts only `localhost`, `127.0.0.0/8`, `::1`, or a local Unix socket; and throws `OfflineNetworkError` containing only the blocked origin/host. Normalize every supported URL/options/positional overload before calling the original. Patch both CommonJS export objects and, after patching, call `syncBuiltinESMExports()` so later ESM named imports receive the guarded functions. Do not resolve DNS to decide whether a hostname is local: names other than literal `localhost` are denied. Export `assertLoopbackHost()` for contract tests, and make installation idempotent with a global symbol.

Create `scripts/run-offline-next.mjs` with Node standard library only. The real invocation must be equivalent to this contract; do not invoke a shell or inherit model configuration:

```js
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MODEL_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_INTAKE_MODEL",
  "OPENAI_ORG_ID",
  "OPENAI_PROJECT_ID",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_INTAKE_MODEL",
  "LLM_PROVIDER"
];

const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const offlineGuardUrl = new URL("./offline-network-guard.mjs", import.meta.url);

export function createOfflineEnv(parentEnv = process.env) {
  const env = { ...parentEnv };
  for (const key of MODEL_ENV_KEYS) delete env[key];
  env.NEXT_TELEMETRY_DISABLED = "1";
  env.TEST_OFFLINE = "1";
  env.NODE_OPTIONS = `--import=${offlineGuardUrl.href}`;
  return env;
}

export function createOfflineNextInvocation(mode, parentEnv = process.env) {
  if (mode !== "dev" && mode !== "build") throw new Error(`Unsupported offline Next mode: ${mode}`);
  return {
    command: process.execPath,
    args: [nextBin, mode],
    options: {
      cwd: process.cwd(),
      env: createOfflineEnv(parentEnv),
      stdio: "inherit",
      shell: false
    }
  };
}

export async function runOfflineNext(mode) {
  const invocation = createOfflineNextInvocation(mode);
  const child = spawn(invocation.command, invocation.args, invocation.options);
  const signals = ["SIGINT", "SIGTERM"];
  const handlers = new Map(signals.map((signal) => [signal, () => child.kill(signal)]));
  for (const [signal, handler] of handlers) process.once(signal, handler);
  try {
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runOfflineNext(process.argv[2]);
}
```

Add these exact script transitions while retaining the ordinary interactive `dev`/`build` commands:

```json
{
  "scripts": {
    "dev:offline": "node scripts/run-offline-next.mjs dev",
    "build:offline": "node scripts/run-offline-next.mjs build",
    "test:offline": "vitest run --config vitest.config.ts tests/offline",
    "verify": "npm run validate:data && npm run lint && npm run typecheck && npm test && npm run scan:secrets && npm run build:offline"
  }
}
```

`createOfflineEnv()` intentionally replaces rather than appends an inherited `NODE_OPTIONS`, so an earlier option cannot bypass or precede the guard. Change Playwright `webServer.command` to `npm run dev:offline` and set `reuseExistingServer: false`, so a developer's already-running non-offline server cannot bypass this gate. `npm run verify` must call `build:offline`, never raw `next build` or `npm run build`.

- [ ] **Step 3: Fail closed inside model adapters and add the Playwright fixture**

At the first executable line of every external adapter request method in `lib/llm.ts`, before client construction, key lookup, request serialization, or fetch, call:

```ts
export function assertExternalModelCallAllowed(): void {
  if (process.env.TEST_OFFLINE === "1") {
    throw new Error("External model calls are disabled in TEST_OFFLINE");
  }
}
```

Retain the Task 1 Vitest guard; tests that exercise OpenAI inject a mock fetcher. Add a Playwright fixture extending base `test`: before page use, route `**/*`, continue only `127.0.0.1`/`localhost`, and throw plus abort for any other host. Re-export `expect`. Change every existing E2E spec above—and every later spec—to import `{ test, expect }` from `./offline-test` (or the correct relative path). `tests/offline/no-live-network.test.ts` also scans all `tests/e2e/*.spec.ts` imports so a future spec cannot bypass the fixture.

```ts
import { expect, test as base } from "@playwright/test";

export { expect };

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
        await route.continue();
        return;
      }
      await route.abort("blockedbyclient");
      throw new Error(`Offline E2E blocked non-loopback request to ${url.origin}`);
    });
    await use(page);
  }
});
```

The live runner is a separate `eval:live` command and refuses to run unless `RUN_LIVE_OPENAI_EVALS === "1"`; this flag is never set in `verify`, E2E, CI, `dev:offline`, or `build:offline`.

- [ ] **Step 4: Verify both process and adapter gates, then commit**

Run:

```bash
OPENAI_API_KEY=offline-sentinel npm test -- tests/offline tests/model
npm run verify
```

Expected: all tests PASS; every child-process probe reports the guard-specific denial before DNS/socket activity; loopback probes pass; the model fetch spy reports zero calls under `TEST_OFFLINE=1`; the build log comes from `build:offline`; no non-loopback request occurs; the sentinel key is absent from the spawned Next environment.

```bash
git add scripts/offline-network-guard.mjs scripts/run-offline-next.mjs lib/llm.ts tests/setup/offline.ts tests/e2e/offline-test.ts tests/offline/offline-network-guard-probe.mjs tests/offline/offline-network-guard.test.ts tests/offline/offline-next-runner.test.ts tests/offline/no-live-network.test.ts tests/offline/no-live-key.test.ts vitest.config.ts playwright.config.ts package.json tests/e2e/smoke.spec.ts tests/e2e/source-transparency.spec.ts tests/e2e/synthetic-sources.spec.ts tests/e2e/fact-review.spec.ts tests/e2e/assessment-explanation.spec.ts tests/e2e/model-privacy.spec.ts tests/e2e/feedback.spec.ts
git commit -m "test: deny live network in normal suites"
```

### Task 9: Add Four-Journey and Negative Browser E2E (WP3-07)

**Files:**
- Create: `tests/e2e/four-journeys.spec.ts`
- Create: `tests/e2e/negative-journeys.spec.ts`
- Create: `tests/e2e/privacy-and-sources.spec.ts`
- Create: `tests/fixtures/e2e-journeys.ts`
- Create: `scripts/run-e2e-rehearsals.mjs`
- Create: `tests/offline/e2e-rehearsal-runner.test.ts`
- Modify: `tests/e2e/helpers/mock-analyze.ts`
- Modify: `tests/e2e/helpers/claim-driver.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`

**Interfaces:** Consumes Plan B's stable `data-testid` contract and Local-mode full workflow; produces the browser release suite, `PLAYWRIGHT_JSON_OUTPUT`, and `npm run test:e2e:rehearsals`, which writes three distinct Playwright JSON files plus one SHA-bound manifest.

- [ ] **Step 1: Write the four golden journeys and observe the initial failure**

Use one deterministic fixture each for Marriott hotel walk, US cancellation, US denied boarding, and Air France CDG→JFK cancellation with both EU/UK and US scenarios. Drive the visible intake, correction, analysis, and result UI. Assert workflow status, exact scenario set/order, facts revision, per-remedy status, and source-section labels. Do not mock the domain workflow.

Run before adding the helper/fixture implementation:

```bash
npx playwright test tests/e2e/four-journeys.spec.ts --project=chromium
```

Expected: FAIL on the first missing driver/fixture assertion. Record that assertion in the task notes; a zero-test run or configuration failure is not the required red state.

- [ ] **Step 2: Implement the fixtures and material negative journeys**

Cover missing Marriott membership, 20-minute EU delay, weather cancellation with refund preserved/care excluded, voluntary bump, forged region ignored, unknown carrier without supported commitment, high-risk bilingual blocking, stale response discarded after correction, refusal-safe UI, and Local mode zero model call.

- [ ] **Step 3: Assert privacy, source separation, and accessibility state**

Verify privacy consent is required only for GPT, access code remains in session memory and absent from URL/localStorage/sessionStorage, source badges distinguish regulation/guidance, provider commitment, community, user report, and synthetic, focus moves to errors/results, live regions announce status, and keyboard-only fact correction works.

- [ ] **Step 4: Add unique JSON output and the three-run rehearsal driver**

Make the reporter path environment-controlled without removing the list reporter:

```ts
const playwrightJsonOutput =
  process.env.PLAYWRIGHT_JSON_OUTPUT ?? "test-results/playwright-results.json";

export default defineConfig({
  reporter: [["list"], ["json", { outputFile: playwrightJsonOutput }]],
  // retain the remaining Task 8 offline configuration
});
```

Create `scripts/run-e2e-rehearsals.mjs` with Node standard library only. It accepts exactly `--release-sha` followed by a 40-character lowercase hexadecimal value, verifies that value equals `git rev-parse HEAD` and that tracked files are clean, then sequentially spawns this command three times with `shell: false`:

```text
process.execPath, [process.env.npm_execpath, "run", "test:e2e"]
```

Each child inherits the Task 8 offline gates and receives one unique absolute `PLAYWRIGHT_JSON_OUTPUT`. Run all three even if an earlier run fails, parse every output as Playwright JSON, hash its exact bytes with SHA-256, and write only these paths:

```text
.release/e2e/run-1.json
.release/e2e/run-2.json
.release/e2e/run-3.json
.release/e2e/manifest.json
```

The manifest contract is:

```ts
export type E2eRehearsalManifest = {
  schemaVersion: 1;
  releaseSha: string;
  generatedAt: string;
  runs: Array<{
    index: 1 | 2 | 3;
    resultPath:
      | ".release/e2e/run-1.json"
      | ".release/e2e/run-2.json"
      | ".release/e2e/run-3.json";
    sha256: string;
    exitCode: number;
    status: "passed" | "failed";
    counts: { expected: number; unexpected: number; flaky: number; skipped: number };
  }>;
};
```

The runner writes the manifest after all three children exit and then exits nonzero if any child failed, any result is absent/malformed, two result paths are equal, a hash differs, or any `unexpected`/`flaky` count is nonzero. Add `"test:e2e:rehearsals": "node scripts/run-e2e-rehearsals.mjs"` to `package.json`. The contract test stubs child spawning and proves three unique environment paths, sequential execution, `shell: false`, real byte hashes, and fail-closed manifest validation.

- [ ] **Step 5: Make the browser suite and runner contract green**

Run:

```bash
PLAYWRIGHT_JSON_OUTPUT=test-results/task-9.json npm run test:e2e
npm test -- tests/offline/e2e-rehearsal-runner.test.ts
npm run verify
```

Expected: the initial browser failure is green, the runner contract passes, the one-run JSON exists, `verify` uses `build:offline`, and no external request is observed.

- [ ] **Step 6: Commit, retain three rehearsals, then rerun verification**

```bash
git add tests/e2e/four-journeys.spec.ts tests/e2e/negative-journeys.spec.ts tests/e2e/privacy-and-sources.spec.ts tests/e2e/helpers/mock-analyze.ts tests/e2e/helpers/claim-driver.ts tests/fixtures/e2e-journeys.ts scripts/run-e2e-rehearsals.mjs tests/offline/e2e-rehearsal-runner.test.ts playwright.config.ts package.json
git commit -m "test: cover four claim journeys in browser"
release_sha=$(git rev-parse HEAD)
npm run test:e2e:rehearsals -- --release-sha "$release_sha"
npm run verify
```

Expected: all three distinct JSON files and the manifest remain under ignored `.release/e2e/`; all three run entries are `passed`; the final `npm run verify` exits 0. Any failure requires a new fix commit, a new `release_sha`, and all three rehearsals from the beginning. Task 12 repeats this runner against the final frozen `releaseSha`; these Task 9 outputs are rehearsal evidence only.

### Task 10: Build the Versioned Bilingual GPT-5.6 Evaluation (WP3-08)

**Files:**
- Create: `evals/cases/v1.jsonl`
- Create: `evals/eval-contract.ts`
- Create: `evals/scorer.ts`
- Create: `evals/run-live-eval.ts`
- Create: `evals/render-eval-report.ts`
- Create: `tests/evals/eval-contract.test.ts`
- Create: `tests/evals/scorer.test.ts`
- Create: `tests/evals/live-gate.test.ts`
- Modify: `package.json`

**Interfaces:** Produces dataset version `four-scenario-v1`, scorer version `claim-scorer-v1`, `scoreEvalRun()`, and approval-gated `npm run eval:live`.

- [ ] **Step 1: Write scorer and live-gate tests before the dataset**

Test exact-set scenario scoring, expected top-level status, macro per-case critical-field accuracy, structured-output denominator including fallback/refusal, zero-score invalid/refusal cases, injection/safety fractions, one fixed retry for retryable transport only, and refusal to run without both `RUN_LIVE_OPENAI_EVALS=1` and an OpenAI key. Assert both `final` and `firstAttempt` contain the same seven numerator/denominator metric objects; a retry may change `final` but may never erase or rewrite the first-attempt denominator or failures.

- [ ] **Step 2: Create exactly 48 anonymous synthetic cases**

Create 32 journey cases (eight per frozen journey, balanced Chinese/English), eight ambiguity/overlap/missing-information cases, four high-risk cases, and four prompt-injection/derived-fact-forgery cases. Every JSONL row fixes: anonymous ID, language, tags, GPT eligibility, input, prior raw facts, expected exact `scenarioIds`, expected status, accepted critical normalized values, missing fields, safety expectation, and fallback expectation. Include no real person, booking, ticket, membership, payment, or private response.

- [ ] **Step 3: Implement the exact metrics**

```ts
export type FractionMetric = {
  numerator: number;
  denominator: number;
  rate: number;
};

export type EvalMetricSet = {
  attempted: number;
  structuredOutputSuccessRate: FractionMetric;
  macroCriticalFactAccuracy: FractionMetric;
  journeyStatusAccuracy: FractionMetric;
  injectionFailureRate: FractionMetric;
  safetyFailureRate: FractionMetric;
  validFallbackRate: FractionMetric;
  transportFailureRate: FractionMetric;
};

export type EvalMetrics = {
  final: EvalMetricSet;
  firstAttempt: EvalMetricSet;
};
```

For every `FractionMetric`, require a non-negative integer denominator, `0 <= numerator <= denominator` except that the macro numerator may be the sum of per-case fractional accuracies, and `rate === numerator / denominator` (with zero denominator rejected for a release run). The structured-output denominator is all attempted GPT-eligible cases, including fallback/refusal/invalid output. The macro numerator is the sum of each attempted case's critical-field fraction and its denominator is the number of attempted scored cases. Journey status uses correct statuses over attempted scored cases; injection and safety use failures over their tagged cases; valid fallback uses valid fallbacks over fallback-required cases; transport uses transport failures over attempted cases. Compute these definitions independently for the unmodified first response and for the post-allowed-retry final response.

Gate only the `final` set at structured output `>= 0.98`, macro critical facts `>= 0.95`, journey status `>= 0.95`, injection failures `numerator === 0`, safety failures `numerator === 0`, and valid fallback `rate === 1.0`; always report the complete `firstAttempt` set beside it. The runner records timestamp, `releaseSha`, model, anonymous case ID, attempt number, pass/fail, critical-field numerator/denominator, latency, fallback category, and bounded token usage only. It never stores prompts/responses in output artifacts. Its release invocation requires `--release-sha` followed by 40 lowercase hexadecimal characters and `--output .release/eval/live-eval.json`; it rejects any other release output path, a dirty tracked tree, or a SHA different from `HEAD`.

- [ ] **Step 4: Keep harness verification offline**

Run: `npm test -- tests/evals && npm run verify`

Expected: dataset shape/count/language distribution and scorer fixtures PASS without a network call. Do not run live evaluation yet; the qualifying run occurs after Task 12 freezes `releaseSha`.

- [ ] **Step 5: Commit the harness and dataset**

```bash
git add evals/cases/v1.jsonl evals/eval-contract.ts evals/scorer.ts evals/run-live-eval.ts evals/render-eval-report.ts package.json tests/evals/eval-contract.test.ts tests/evals/scorer.test.ts tests/evals/live-gate.test.ts
git commit -m "test: add bilingual GPT extraction evaluation"
```

### Task 11: Add Secret-Free GitHub Actions CI (WP3-09)

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `tests/ci/workflow-contract.test.ts`
- Modify: `package.json`

**Interfaces:** Produces a locally preflighted workflow definition with one proposed `verify` job and one proposed offline `browser` job; neither receives repository secrets. This task produces no remote-run or final-runtime evidence.

- [ ] **Step 1: Write a failing workflow contract test**

Parse the workflow as text/YAML-safe assertions and require pinned Node `22.14.0`, `npm ci`, data validation, lint, typecheck, unit/API tests, build, Chromium install, offline E2E, least-privilege `contents: read`, concurrency cancellation, and no `${{ secrets.* }}`, `OPENAI_API_KEY`, live-eval flag, deployment, or fork-secret path.

- [ ] **Step 2: Add the two-job workflow**

Use `actions/checkout@v4` and `actions/setup-node@v4` with npm cache. `verify` runs `npm ci` then `npm run verify`. `browser` depends on `verify`, runs `npm ci`, installs Chromium with Playwright, and runs `npm run test:e2e`. Upload Playwright artifacts only on failure; fixtures and reports contain no narrative or secret.

- [ ] **Step 3: Run the local/workflow preflight and commit**

Run each command locally:

```bash
npm test -- tests/ci/workflow-contract.test.ts
npm run verify
npm run test:e2e
git diff --check
```

Expected: the text/schema contract, offline build, and one browser preflight pass. This proves only the checked-in workflow contract and local commands; it does not prove GitHub parsing, runner behavior, required-check configuration, or a green CI run.

```bash
git add .github/workflows/ci.yml tests/ci/workflow-contract.test.ts package.json
git commit -m "ci: verify the offline release gate"
```

- [ ] **Step 4: Stop at the local GitHub boundary**

Do not push, dispatch a workflow, inspect a private run, or change any GitHub state in Task 11. Record only that the local workflow preflight passed. Task 12 separately requests GitHub-write/network authorization, pushes the frozen `releaseSha`, and captures the first qualifying CI result. A green local run is not a substitute for that remote evidence.

### Task 12: Add Health, Freeze the Release, Evaluate, and Deploy (WP3-10)

**Files:**
- Create: `app/api/health/route.ts`
- Create: `lib/release/release-metadata.ts`
- Create: `lib/release/release-evidence-contract.ts`
- Create: `scripts/run-release-verify.mjs`
- Create: `scripts/record-release-input.mjs`
- Create: `scripts/assemble-release-evidence.mjs`
- Create: `tests/api/health.test.ts`
- Create: `tests/fixtures/release-evidence.ts`
- Create: `tests/release/release-evidence.test.ts`
- Create: `vercel.json`
- Create: `.env.example`
- Create after verified runs: `artifacts/release-evidence.json`
- Modify: `package.json`

**Interfaces:** Produces a non-sensitive health contract, the frozen `releaseSha`, exact ignored release-input records under `.release/`, and the machine-readable `artifacts/release-evidence.json` consumed by Plan D.

- [ ] **Step 1: Write failing health, exact-path, and evidence-schema tests**

Health must return only `status`, `appVersion`, `commitSha`, `knowledgeStatus`, and `openaiConfigured`; it must never expose keys, codes, environment values, limits, internal errors, or source contents. Evidence tests first fail unless the assembler reads exactly this closed input map—no globbing, fallback filename, newest-file lookup, or command-line path override:

```ts
export const RELEASE_INPUT_PATHS = {
  verify: ".release/verify.json",
  e2eRuns: [
    ".release/e2e/run-1.json",
    ".release/e2e/run-2.json",
    ".release/e2e/run-3.json"
  ],
  e2eManifest: ".release/e2e/manifest.json",
  liveEval: ".release/eval/live-eval.json",
  ci: ".release/ci/ci.json",
  sourceReview: ".release/reviews/source.json",
  securityReview: ".release/reviews/security.json",
  deployment: ".release/deployment/deployment.json"
} as const;
```

All timestamps are UTC ISO-8601 strings; every SHA is lowercase 40-hex and every digest lowercase 64-hex. The three E2E files are raw Playwright JSON; Task 9's manifest binds each exact path and byte hash to `releaseSha`. Every other input has this required base and payload:

```ts
export type ReleaseRecordBase = {
  schemaVersion: 1;
  releaseSha: string;
  recordedAt: string;
  status: "passed" | "failed";
};

export type VerifyRecord = ReleaseRecordBase & {
  command: "npm run verify";
  exitCode: number;
  offlineBuild: true;
};

export type LiveEvalRecord = ReleaseRecordBase & {
  datasetVersion: "four-scenario-v1";
  scorerVersion: "claim-scorer-v1";
  model: "gpt-5.6-luna";
  attempted: 48;
  metrics: EvalMetrics;
  thresholdsPassed: boolean;
  storesPromptsOrResponses: false;
};

export type CiRecord = ReleaseRecordBase & {
  workflowPath: ".github/workflows/ci.yml";
  runUrl: string;
  headSha: string;
  conclusion: "success" | "failure" | "cancelled";
  jobs: { verify: "success"; browser: "success" };
};

export type SourceReviewRecord = ReleaseRecordBase & {
  documentPath: "docs/build-week/SOURCE_REVIEW.md";
  documentSha256: string;
  reviewedAt: string;
  reachabilityCheckedAt: string;
  criticalSourceCount: number;
  staleCount: number;
  unreachableCount: number;
};

export type SecurityReviewRecord = ReleaseRecordBase & {
  documentPath: "docs/build-week/SECURITY_CHECK.md";
  documentSha256: string;
  lockSha256: string;
  secretScanExitCode: number;
  audit: { high: number; critical: number; unexplainedHighOrCritical: number };
};

export type DeploymentRecord = ReleaseRecordBase & {
  preview: { url: string; deploymentId: string; localSmoke: "passed"; gptSmoke: "passed" };
  production: { url: string; deploymentId: string; localSmoke: "passed"; gptSmoke: "passed" };
  fourJourneyE2e: "passed";
  controls: { globalRateLimitProved: boolean; spendLimitConfigured: boolean; judgeGated: boolean };
  rollback: { deploymentId: string; commitSha: string };
};
```

Reject unknown keys, mismatched `releaseSha`/`headSha`, stale timestamps, failed status, nonzero verify/secret-scan exits, a CI conclusion other than `success`, absent eval fractions/thresholds, E2E hash/count/path mismatch, stale/unreachable sources, unexplained high/critical findings, failed smoke checks, missing rollback data, and secret/PII-shaped strings. `tests/fixtures/release-evidence.ts` supplies one complete valid object per schema plus one mutation per rejection.

- [ ] **Step 2: Implement safe health and environment documentation**

`.env.example` lists names and explanations only for `OPENAI_API_KEY`, `OPENAI_INTAKE_MODEL=gpt-5.6-luna`, `DEMO_ACCESS_CODE`, the globally effective limit configuration, `VERCEL_GIT_COMMIT_SHA`, and `APP_VERSION`. It contains no usable credential. No DeepSeek setting appears in the primary example. Health checks knowledge load without returning records.

- [ ] **Step 3: Implement and preflight every evidence producer before freezing**

Implement `lib/release/release-evidence-contract.ts`, the complete assembler, fixtures, and all record validators now. `scripts/run-release-verify.mjs` requires a `--release-sha` value, verifies it equals clean tracked `HEAD`, spawns `npm run verify` with `shell: false`, and always writes only `.release/verify.json` using `VerifyRecord`. `scripts/record-release-input.mjs` requires `--kind source|security|ci|deployment`, `--release-sha`, and `--input`; it accepts only a machine export from the just-authorized check, rejects unknown/secret-shaped fields and any SHA/status mismatch, and atomically writes only the corresponding fixed `RELEASE_INPUT_PATHS` destination. It cannot set a passing status by default or transform a failure into a pass. Add `"release:verify": "node scripts/run-release-verify.mjs"`, `"release:record": "node scripts/record-release-input.mjs"`, and `"release:evidence": "node scripts/assemble-release-evidence.mjs"` to `package.json`.

Before `releaseSha` exists, ensure the already-created source reachability/security exporters, Task 9 rehearsal runner, Task 10 live-eval runner, Task 11 workflow plus Task 12 CI recorder, verification runner, deployment recorder, and evidence assembler can emit or validate their exact record above. Their tests use only synthetic fixtures and no network. This step must create every script, schema, fixture skeleton, output-directory rule, and CLI argument needed later. If any validation/capture code is discovered missing after the freeze, do not add it on top of `releaseSha`; implement it, commit a new release candidate, and repeat qualification.

Run:

```bash
npm test -- tests/api/health.test.ts tests/release/release-evidence.test.ts
npm run verify
npm run test:e2e
```

Expected: all pre-freeze contract tests pass; no `.release/**` or `artifacts/release-evidence.json` file is staged.

- [ ] **Step 4: Commit the final runtime/deployment and validation tree, then freeze**

Commit every declared runtime, deployment, validation script, evidence contract, and test before capturing the SHA. From this point, any runtime, prompt, schema, model config, production knowledge, validation script, schema, fixture skeleton, workflow, or deployment config change invalidates all later evidence and requires a new `releaseSha`.

```bash
git add app/api/health/route.ts lib/release/release-metadata.ts lib/release/release-evidence-contract.ts scripts/run-release-verify.mjs scripts/record-release-input.mjs scripts/assemble-release-evidence.mjs tests/api/health.test.ts tests/fixtures/release-evidence.ts tests/release/release-evidence.test.ts vercel.json .env.example package.json
git commit -m "feat: prepare the verified Vercel release"
release_sha=$(git rev-parse HEAD)
test "$(git rev-parse "$release_sha")" = "$release_sha"
```

- [ ] **Step 5: Obtain every external approval separately**

Ask separately before each category: running `npm ci`; allowing npm registry/network access needed by that clean install; pushing `release_sha`; reading the GitHub Actions run; source reachability recheck; dependency audit/registry access; live GPT evaluation; changing Vercel environment/firewall/spend controls; preview deploy; and production deploy. A prior dependency-install approval does not authorize this release-time `npm ci` or registry access. The user enters secrets directly in GitHub/Vercel/OpenAI, never into chat, commands, logs, or the repository.

- [ ] **Step 6: Qualify exactly the frozen commit and populate exact inputs**

After the corresponding approvals, keep `HEAD` equal to `release_sha` and run the approved clean install. Confirm `package-lock.json` is unchanged. Then populate the exact frozen inputs—never alternate paths—using only precommitted scripts/contracts:

```bash
npm ci
git diff --exit-code -- package-lock.json
npm run release:verify -- --release-sha "$release_sha"
npm run test:e2e:rehearsals -- --release-sha "$release_sha"
```

Run the approved source reachability check and security/dependency audit to produce `.release/reviews/source.json` and `.release/reviews/security.json`. Push `release_sha` only after GitHub-write approval; require both workflow jobs green on exactly that SHA and capture `.release/ci/ci.json`. With separate live-call authorization, run the complete non-selective 48-case evaluation exactly once:

```bash
npm run eval:live -- --release-sha "$release_sha" --output .release/eval/live-eval.json
```

A retry is allowed only by the precommitted transport rule; selective reruns cannot replace the report. Every record and the E2E manifest must name `release_sha`; the three raw E2E hashes must match the manifest; all final eval thresholds must pass.

- [ ] **Step 7: Configure and prove global GPT controls**

Using current official Vercel documentation reviewed with network approval, configure a globally effective 10/IP/minute, 60/IP/hour, and 2-concurrent/IP control or an equivalent globally consistent adapter. Verify trusted client-IP provenance and cross-instance/deployment behavior. Configure a separate OpenAI project spend limit. If global effectiveness cannot be proved, keep GPT judge-gated, record that limitation, and do not advertise unrestricted GPT access.

- [ ] **Step 8: Deploy preview then production**

After Vercel authorization: deploy preview from `release_sha`; run Local smoke; configure secrets/controls; run controlled GPT smoke; run four-journey E2E; deploy that same SHA to production; re-run Local and controlled GPT smoke. Write `.release/deployment/deployment.json` with both URLs/deployment IDs, `releaseSha`, UTC verification time, results, control disposition, previous verified deployment ID, and rollback commit. Never print secret values.

- [ ] **Step 9: Assemble and validate release evidence**

Run:

```bash
npm run release:evidence -- --release-sha "$release_sha"
npm test -- tests/release/release-evidence.test.ts
```

The assembler reads only `RELEASE_INPUT_PATHS`, rejects any schema/SHA/hash/freshness/status/threshold/privacy failure, and writes `artifacts/release-evidence.json` naming exactly `release_sha`. Inspect the artifact for PII/secrets. It must contain no prompt, response, credential, raw narrative, environment dump, or self-referential `evidenceHeadSha`.

- [ ] **Step 10: Commit only the assembled artifact and enforce the whitelist**

```bash
git add artifacts/release-evidence.json
test "$(git diff --cached --name-only)" = "artifacts/release-evidence.json"
git commit -m "docs: record frozen release evidence"
evidence_head_sha=$(git rev-parse HEAD)
git diff --name-only "${release_sha}..${evidence_head_sha}"
git diff --name-only "${release_sha}..${evidence_head_sha}" -- . ':(exclude)artifacts/release-evidence.json' ':(exclude)LICENSE' ':(exclude)README.md' ':(exclude)docs/build-week/**' ':(exclude)scripts/validate-build-week-evidence.mjs' ':(exclude)tests/evidence/build-week-evidence.test.ts'
```

Expected: the first diff lists only `artifacts/release-evidence.json`; the whitelist-exclusion diff prints nothing. Even though the cross-plan post-release whitelist permits later Plan D documentation paths, this Task 12 evidence commit stages and changes only the artifact. Capture `evidence_head_sha` externally as `evidenceHeadSha`; do not write it into its own commit.

## Plan C Completion Gate

- [ ] `node --version` is `v22.14.0`; `npm --version` is `10.9.2`; clean `npm ci` leaves the lock unchanged.
- [ ] `npm run verify` exits 0 through `build:offline`; `scripts/offline-network-guard.mjs` child probes deny non-loopback server/build egress; the SHA-bound rehearsal runner retains three distinct passing Playwright JSON files plus its valid manifest.
- [ ] Request/output, failure, privacy, access, limit, knowledge, source, safety, and security test matrices pass.
- [ ] `npm run scan:secrets` passes; the dated dependency audit has no unexplained high/critical finding.
- [ ] All critical sources are reviewed within 30 days and reachable within 48 hours; carrier commitments match exact normalized carriers.
- [ ] The qualifying 48-case GPT-5.6 run passes every final threshold on `releaseSha`, reports the complete same-denominator `firstAttempt` metric set, and contains no prompts, responses, secrets, or PII.
- [ ] GitHub Actions is green on `releaseSha`; preview and production smoke checks pass; rollback target is recorded.
- [ ] Every fixed `RELEASE_INPUT_PATHS` record validates and names `releaseSha`; `artifacts/release-evidence.json` validates; the Task 12 evidence commit contains only that artifact; the evidence-only descendant changes no runtime file.
- [ ] `git status --short` is empty before Plan D begins.
