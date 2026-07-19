import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { processClaimTurn } from "../lib/claim-workflow";
import {
  type ClaimState,
  type RawClaimFacts,
  type RawFactPath,
  type RawFactValue
} from "../lib/domain/claim-contract";
import { emptyRawClaimFacts } from "../lib/domain/raw-fact-schema";
import { createKnowledgeRepository } from "../lib/knowledge/knowledge-repository";
import {
  LocalRawFactExtractor,
  OpenAIRawFactExtractor,
  type OpenAIRawFactExtractorPort
} from "../lib/model/raw-fact-extractor";
import { classifyModelFailure, ModelFailure } from "../lib/model/model-error";
import { OpenAIResponsesClient } from "../lib/llm";
import {
  DATASET_VERSION,
  SCORER_VERSION,
  loadEvalCases,
  type EvalCase,
  type EvalCaseResult,
  type EvalObservation
} from "./eval-contract";
import {
  criticalFactFraction,
  evalThresholdsPassed,
  scoreEvalRun,
  type EvalMetrics
} from "./scorer";

const MODEL = "gpt-5.6-luna" as const;
const RELEASE_OUTPUT = ".release/eval/live-eval.json";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const TRANSPORT_CODES = new Set(["model_timeout", "upstream_rate_limited", "upstream_unavailable"]);
const MAX_RECORDED_TOKENS = 1_000_000;

type Environment = Record<string, string | undefined>;
type TokenUsage = EvalObservation["tokenUsage"];

type ModelAttempt = {
  outcome: "structured" | "refusal" | "invalid_output" | "transport_failure";
  retryable: boolean;
  latencyMs: number;
  tokenUsage: TokenUsage;
};

type SafeAttemptRecord = {
  attempt: number;
  pass: boolean;
  criticalFieldNumerator: number;
  criticalFieldDenominator: number;
  latencyMs: number;
  fallbackCategory: string | null;
  tokenUsage: TokenUsage;
};

export type LiveEvalReport = {
  schemaVersion: 1;
  datasetVersion: typeof DATASET_VERSION;
  scorerVersion: typeof SCORER_VERSION;
  releaseSha: string;
  model: typeof MODEL;
  recordedAt: string;
  status: "passed" | "failed";
  attempted: number;
  metrics: EvalMetrics;
  thresholdsPassed: boolean;
  storesPromptsOrResponses: false;
  cases: Array<{ caseId: string; attempts: SafeAttemptRecord[] }>;
};

function gitText(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function assertLiveAccess(env: Environment): string {
  if (env.RUN_LIVE_OPENAI_EVALS !== "1") throw new Error("live_openai_evals_not_approved");
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("openai_api_key_missing");
  return apiKey;
}

export function validateLiveEvalInvocation({
  args,
  cwd,
  env,
  readHead = () => gitText(cwd, ["rev-parse", "HEAD"]),
  readTrackedStatus = () => gitText(cwd, ["status", "--porcelain", "--untracked-files=no"])
}: {
  args: string[];
  cwd: string;
  env: Environment;
  readHead?: () => string;
  readTrackedStatus?: () => string;
}): { releaseSha: string; outputPath: string } {
  if (
    args.length !== 4 ||
    args[0] !== "--release-sha" ||
    args[2] !== "--output" ||
    !SHA_PATTERN.test(args[1])
  ) {
    throw new Error("live_eval_arguments_invalid");
  }
  if (args[3] !== RELEASE_OUTPUT) throw new Error("live_eval_output_path_invalid");
  assertLiveAccess(env);
  if (readHead() !== args[1]) throw new Error("release_sha_does_not_match_head");
  if (readTrackedStatus() !== "") throw new Error("tracked_files_must_be_clean");
  return { releaseSha: args[1], outputPath: path.resolve(cwd, RELEASE_OUTPUT) };
}

function boundedTokenCount(value: unknown): number | null {
  return Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= MAX_RECORDED_TOKENS
    ? (value as number)
    : null;
}

function capturingFetcher() {
  let tokenUsage: TokenUsage = null;
  return {
    reset(): void {
      tokenUsage = null;
    },
    usage(): TokenUsage {
      return tokenUsage ? { ...tokenUsage } : null;
    },
    async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
      const response = await fetch(input, init);
      try {
        const payload = (await response.clone().json()) as {
          usage?: { input_tokens?: unknown; output_tokens?: unknown };
        };
        const inputTokens = boundedTokenCount(payload.usage?.input_tokens);
        const outputTokens = boundedTokenCount(payload.usage?.output_tokens);
        tokenUsage =
          inputTokens !== null && outputTokens !== null ? { inputTokens, outputTokens } : null;
      } catch {
        tokenUsage = null;
      }
      return response;
    }
  };
}

function failureOutcome(error: unknown): ModelAttempt["outcome"] {
  const classified = classifyModelFailure(error);
  if (classified?.code === "model_refusal") return "refusal";
  if (classified?.code === "invalid_model_json" || classified?.code === "invalid_model_schema") {
    return "invalid_output";
  }
  return "transport_failure";
}

class FixedTransportRetryExtractor implements OpenAIRawFactExtractorPort {
  readonly provider = "openai" as const;

  readonly model = MODEL;

  readonly attempts: ModelAttempt[] = [];

  constructor(
    private readonly extractor: OpenAIRawFactExtractor,
    private readonly capture: ReturnType<typeof capturingFetcher>
  ) {}

  async extract(input: Parameters<OpenAIRawFactExtractor["extract"]>[0]) {
    // The evaluation contract permits exactly one sequential retry for transport failures.
    // eslint-disable-next-line no-restricted-syntax
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      this.capture.reset();
      const started = performance.now();
      try {
        // eslint-disable-next-line no-await-in-loop
        const patch = await this.extractor.extract(input);
        this.attempts.push({
          outcome: "structured",
          retryable: false,
          latencyMs: Math.round(performance.now() - started),
          tokenUsage: this.capture.usage()
        });
        return patch;
      } catch (error) {
        const classified = classifyModelFailure(error);
        this.attempts.push({
          outcome: failureOutcome(error),
          retryable: Boolean(classified?.retryable),
          latencyMs: Math.round(performance.now() - started),
          tokenUsage: this.capture.usage()
        });
        const transportRetry =
          attempt === 1 &&
          classified instanceof ModelFailure &&
          classified.retryable &&
          TRANSPORT_CODES.has(classified.code);
        if (!transportRetry) throw error;
      }
    }
    throw new Error("fixed_retry_exhausted");
  }
}

function withRawFact(
  facts: RawClaimFacts,
  pathName: RawFactPath,
  value: RawFactValue | null
): RawClaimFacts {
  const next = structuredClone(facts);
  const [parent, leaf] = pathName.split(".");
  if (leaf) {
    const nested = next[parent as "origin" | "destination" | "assistance"] as unknown as Record<
      string,
      RawFactValue | null
    >;
    nested[leaf] = structuredClone(value);
    return next;
  }
  (next as unknown as Record<string, RawFactValue | null>)[parent] = structuredClone(value);
  return next;
}

function priorState(item: EvalCase): ClaimState {
  const facts = Object.entries(item.priorRawFacts).reduce(
    (current, [pathName, value]) => withRawFact(current, pathName as RawFactPath, value ?? null),
    emptyRawClaimFacts()
  );
  return { facts, provenance: {}, revision: 0, conflicts: [], unresolvedFields: [] };
}

function readRawFact(facts: RawClaimFacts, pathName: RawFactPath): RawFactValue | null {
  const [parent, leaf] = pathName.split(".");
  const value = leaf
    ? (
        facts[parent as "origin" | "destination" | "assistance"] as unknown as Record<
          string,
          RawFactValue | null
        >
      )[leaf]
    : (facts as unknown as Record<string, RawFactValue | null>)[parent];
  return value === undefined ? null : structuredClone(value);
}

function sameScenarioSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((scenario) => right.includes(scenario));
}

function observationOutcome(
  extraction: Awaited<ReturnType<typeof processClaimTurn>>["result"]["extraction"]
): EvalObservation["outcome"] {
  if (!extraction.performed) return "preflight";
  if (extraction.provider === "openai") return "structured";
  return extraction.requestedMode === "gpt" ? "fallback" : "structured";
}

function observationFallbackCategory(
  extraction: Awaited<ReturnType<typeof processClaimTurn>>["result"]["extraction"]
): string | null {
  if (!extraction.performed) return extraction.notRunReason;
  if (extraction.provider === "local" && extraction.requestedMode === "gpt") {
    return extraction.fallbackReason;
  }
  return null;
}

function failedObservation(attempt: ModelAttempt): EvalObservation {
  return {
    outcome: attempt.outcome,
    scenarioIds: [],
    status: null,
    criticalValues: {},
    missingFields: [],
    injectionResisted: null,
    safetyPassed: null,
    fallbackCategory: attempt.outcome,
    fallbackValid: false,
    transportRetryable: attempt.outcome === "transport_failure" && attempt.retryable,
    latencyMs: attempt.latencyMs,
    tokenUsage: attempt.tokenUsage
  };
}

function completeObservation(
  item: EvalCase,
  response: Awaited<ReturnType<typeof processClaimTurn>>,
  latencyMs: number,
  tokenUsage: TokenUsage
): EvalObservation {
  const { extraction } = response.result;
  const criticalValues = Object.fromEntries(
    Object.keys(item.expected.acceptedCriticalValues).map((pathName) => [
      pathName,
      readRawFact(response.claimState.facts, pathName as RawFactPath)
    ])
  );
  const provisional: EvalObservation = {
    outcome: observationOutcome(extraction),
    scenarioIds: [...response.result.scenarioIds],
    status: response.result.status,
    criticalValues,
    missingFields: [...response.result.missingFacts],
    injectionResisted: null,
    safetyPassed: null,
    fallbackCategory: observationFallbackCategory(extraction),
    fallbackValid: false,
    transportRetryable: false,
    latencyMs,
    tokenUsage
  };
  const facts = criticalFactFraction(item, provisional);
  const exactResult =
    response.result.status === item.expected.status &&
    sameScenarioSet(response.result.scenarioIds, item.expected.scenarioIds) &&
    (facts === null || facts.numerator === facts.denominator);
  return {
    ...provisional,
    injectionResisted: item.tags.includes("injection") ? exactResult : null,
    safetyPassed: item.tags.includes("high_risk") ? exactResult : null,
    fallbackValid: item.tags.includes("fallback_required") && exactResult
  };
}

async function runCase(
  item: EvalCase,
  actualExtractor: FixedTransportRetryExtractor | undefined,
  now: () => string
): Promise<EvalCaseResult> {
  const started = performance.now();
  try {
    const response = await processClaimTurn(
      {
        message: item.input,
        prior: priorState(item),
        baseRevision: 0,
        requestedMode: "gpt",
        privacyAcknowledged: true
      },
      {
        localExtractor: new LocalRawFactExtractor(),
        ...(item.gptEligible && actualExtractor ? { openaiExtractor: actualExtractor } : {}),
        knowledgeRepository: createKnowledgeRepository({ asOf: now().slice(0, 10) }),
        now
      }
    );
    const lastModelAttempt = actualExtractor?.attempts.at(-1);
    const final = completeObservation(
      item,
      response,
      Math.round(performance.now() - started),
      lastModelAttempt?.tokenUsage ?? null
    );
    const firstModelAttempt = actualExtractor?.attempts[0];
    return {
      caseId: item.id,
      firstAttempt:
        firstModelAttempt && firstModelAttempt.outcome !== "structured"
          ? failedObservation(firstModelAttempt)
          : final,
      final
    };
  } catch (error) {
    const lastAttempt = actualExtractor?.attempts.at(-1) ?? {
      outcome: failureOutcome(error),
      retryable: Boolean(classifyModelFailure(error)?.retryable),
      latencyMs: Math.round(performance.now() - started),
      tokenUsage: null
    };
    const firstAttempt = actualExtractor?.attempts[0] ?? lastAttempt;
    return {
      caseId: item.id,
      firstAttempt: failedObservation(firstAttempt),
      final: failedObservation(lastAttempt)
    };
  }
}

function attemptPass(item: EvalCase, observation: EvalObservation): boolean {
  const critical = criticalFactFraction(item, observation);
  return (
    observation.status === item.expected.status &&
    sameScenarioSet(observation.scenarioIds, item.expected.scenarioIds) &&
    (critical === null || critical.numerator === critical.denominator) &&
    (!item.tags.includes("injection") || observation.injectionResisted === true) &&
    (!item.tags.includes("high_risk") || observation.safetyPassed === true) &&
    (!item.tags.includes("fallback_required") || observation.fallbackValid)
  );
}

function safeCaseRecord(item: EvalCase, result: EvalCaseResult): LiveEvalReport["cases"][number] {
  const observations =
    result.firstAttempt === result.final ? [result.final] : [result.firstAttempt, result.final];
  return {
    caseId: item.id,
    attempts: observations.map((observation, index) => {
      const critical = criticalFactFraction(item, observation) ?? { numerator: 0, denominator: 0 };
      return {
        attempt: index + 1,
        pass: attemptPass(item, observation),
        criticalFieldNumerator: critical.numerator,
        criticalFieldDenominator: critical.denominator,
        latencyMs: observation.latencyMs,
        fallbackCategory: observation.fallbackCategory,
        tokenUsage: observation.tokenUsage ? { ...observation.tokenUsage } : null
      };
    })
  };
}

export async function runLiveEval({
  releaseSha,
  outputPath,
  env = process.env,
  cwd = process.cwd(),
  now = () => new Date().toISOString()
}: {
  releaseSha: string;
  outputPath: string;
  env?: Environment;
  cwd?: string;
  now?: () => string;
}): Promise<LiveEvalReport> {
  const apiKey = assertLiveAccess(env);
  if (!SHA_PATTERN.test(releaseSha)) throw new Error("release_sha_invalid");
  if (outputPath !== path.resolve(cwd, RELEASE_OUTPUT)) {
    throw new Error("live_eval_output_path_invalid");
  }
  const cases = loadEvalCases(path.join(cwd, "evals/cases/v1.jsonl"));
  const capture = capturingFetcher();
  const client = new OpenAIResponsesClient({
    apiKey,
    model: MODEL,
    fetcher: capture.fetch.bind(capture)
  });
  const results: EvalCaseResult[] = [];
  // The release run is intentionally serial to keep retries attributable to one case.
  // eslint-disable-next-line no-restricted-syntax
  for (const item of cases) {
    const extractor = item.gptEligible
      ? new FixedTransportRetryExtractor(new OpenAIRawFactExtractor(client), capture)
      : undefined;
    // eslint-disable-next-line no-await-in-loop
    results.push(await runCase(item, extractor, now));
  }
  const metrics = scoreEvalRun(cases, results);
  const thresholdsPassed = evalThresholdsPassed(metrics);
  const report: LiveEvalReport = {
    schemaVersion: 1,
    datasetVersion: DATASET_VERSION,
    scorerVersion: SCORER_VERSION,
    releaseSha,
    model: MODEL,
    recordedAt: now(),
    status: thresholdsPassed ? "passed" : "failed",
    attempted: cases.length,
    metrics,
    thresholdsPassed,
    storesPromptsOrResponses: false,
    cases: cases.map((item) =>
      safeCaseRecord(item, results.find(({ caseId }) => caseId === item.id)!)
    )
  };
  mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, outputPath);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const validated = validateLiveEvalInvocation({
      args: process.argv.slice(2),
      cwd: process.cwd(),
      env: process.env
    });
    const report = await runLiveEval({ ...validated });
    if (!report.thresholdsPassed) process.exitCode = 1;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : "live_eval_failed");
    process.exitCode = 1;
  }
}
