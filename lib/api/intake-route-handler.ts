import {
  createIntakePostHandler,
  processClaimTurn,
  type ProcessClaimTurnDependencies
} from "../intake";
import { preflightGuard } from "../domain/safety-guard";
import { LocalRawFactExtractor, OpenAIRawFactExtractor } from "../model/raw-fact-extractor";
import { createPublicOpenAIClientFromEnv } from "../llm";
import { verifyDemoAccess } from "../access/demo-access";
import {
  guardGptRequest,
  type BudgetGate,
  type TrustedClientIdentityResolver
} from "../limits/gpt-request-guard";
import type { ConcurrencyLimiter } from "../limits/concurrency-limiter";
import type { RateLimiter } from "../limits/rate-limiter";
import { runtimeGptControls } from "./gpt-runtime";
import {
  hasExactDomainProcessorResponseKeys,
  parseAnalyzeClaimRequest,
  parseAnalyzeRequest,
  parseExtractionMetadata,
  type ParsedAnalyzeRequest
} from "./analyze-contract";
import {
  toApiErrorResponse,
  toCaughtApiErrorResponse,
  withRequestId,
  type RequestIdFactory
} from "./api-response";
import { INPUT_LIMITS } from "./input-limits";
import { isClaimStateReplayable, readJsonBody } from "./request-body";

type RouteTelemetryDependencies = Omit<
  NonNullable<ProcessClaimTurnDependencies["telemetry"]>,
  "requestId"
>;

export type IntakeRouteDependencies = Omit<Partial<ProcessClaimTurnDependencies>, "telemetry"> & {
  processRequest?: typeof processClaimTurn;
  requestIdFactory?: RequestIdFactory;
  telemetry?: RouteTelemetryDependencies;
  gptGuard?: typeof guardGptRequest;
  createOpenAIExtractor?: () => ProcessClaimTurnDependencies["openaiExtractor"] | undefined;
  demoAccessCode?: string;
  gptControls?: {
    identityResolver: TrustedClientIdentityResolver;
    rateLimiter: RateLimiter;
    concurrencyLimiter: ConcurrencyLimiter;
    budget: BudgetGate;
    guard?: typeof guardGptRequest;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lazyLocalExtractor(): ProcessClaimTurnDependencies["localExtractor"] {
  return {
    provider: "local",
    model: null,
    async extract(input) {
      return new LocalRawFactExtractor().extract(input);
    }
  };
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isCanonicalShape(body: Record<string, unknown>): boolean {
  return ["prior", "baseRevision", "correction", "requestedMode", "privacyAcknowledged"].some(
    (key) => hasOwn(body, key)
  );
}

function codePointLength(value: string): number {
  return [...value].length;
}

function legacyStringLimit(key: string, arrayItem: boolean): number {
  if (arrayItem) return INPUT_LIMITS.collectionItemCodePoints;
  if (key === "userGoal") return INPUT_LIMITS.userGoalCodePoints;
  return INPUT_LIMITS.ordinaryStringCodePoints;
}

function legacyFactsExceedLimits(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const pending: Array<{ key: string; candidate: unknown; arrayItem: boolean }> = Object.entries(
    value
  ).map(([key, candidate]) => ({ key, candidate, arrayItem: false }));
  while (pending.length > 0) {
    const { key, candidate, arrayItem } = pending.pop() as (typeof pending)[number];
    if (typeof candidate === "string") {
      const limit = legacyStringLimit(key, arrayItem);
      if (codePointLength(candidate) > limit) return true;
    } else if (Array.isArray(candidate)) {
      if (candidate.length > INPUT_LIMITS.collectionItems) return true;
      candidate.forEach((item) => pending.push({ key, candidate: item, arrayItem: true }));
    } else if (isRecord(candidate)) {
      Object.entries(candidate).forEach(([nestedKey, nestedCandidate]) =>
        pending.push({ key: nestedKey, candidate: nestedCandidate, arrayItem: false })
      );
    }
  }
  return false;
}

function legacyRequestExceedsLimits(body: Record<string, unknown>): boolean {
  return (
    (typeof body.message === "string" &&
      codePointLength(body.message) > INPUT_LIMITS.messageCodePoints) ||
    legacyFactsExceedLimits(body.facts)
  );
}

function hasValidExtractionMetadata(value: unknown, request: ParsedAnalyzeRequest): boolean {
  if (!isRecord(value) || !isRecord(value.result)) return false;
  const parsed = parseExtractionMetadata(value.result.extraction);
  if (!parsed.success || parsed.data.requestedMode !== (request.requestedMode ?? "local")) {
    return false;
  }
  if (request.intent === "correction_only") {
    return parsed.data.performed === false && parsed.data.notRunReason === "correction_only";
  }
  if (preflightGuard(request.message).status !== "pass") {
    return parsed.data.performed === false && parsed.data.notRunReason === "preflight_guard";
  }
  return parsed.data.performed === true;
}

function replayJsonRequest(request: Request, body: unknown): Request {
  const replayBody = JSON.stringify(body, (_key, value: unknown) => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("non_finite_number");
    }
    return value;
  });
  return new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: replayBody
  });
}

function claimDependencies(
  overrides: IntakeRouteDependencies,
  requestId: string
): ProcessClaimTurnDependencies {
  return {
    localExtractor: overrides.localExtractor ?? lazyLocalExtractor(),
    ...(overrides.openaiExtractor ? { openaiExtractor: overrides.openaiExtractor } : {}),
    ...(overrides.knowledgeRepository
      ? { knowledgeRepository: overrides.knowledgeRepository }
      : {}),
    ...(overrides.now ? { now: overrides.now } : {}),
    ...(overrides.telemetry ? { telemetry: { ...overrides.telemetry, requestId } } : {})
  };
}

function canonicalIntakeResponse(response: Awaited<ReturnType<typeof processClaimTurn>>) {
  return {
    baseRevision: response.baseRevision,
    claimState: response.claimState,
    result: response.result,
    context: response.context
  };
}

export function createIntakeRouteHandler(overrides: IntakeRouteDependencies = {}) {
  return async function intakePost(request: Request): Promise<Response> {
    const requestId = withRequestId(overrides.requestIdFactory);
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      return toCaughtApiErrorResponse(error, requestId);
    }

    if (!isRecord(body) || !isCanonicalShape(body)) {
      let replayedRequest: Request;
      try {
        if (isRecord(body) && legacyRequestExceedsLimits(body)) {
          return toApiErrorResponse("unprocessable_request", requestId);
        }
        replayedRequest = replayJsonRequest(request, body);
      } catch {
        return toApiErrorResponse("unprocessable_request", requestId);
      }
      const dependencies = claimDependencies(
        { ...overrides, openaiExtractor: undefined },
        requestId
      );
      return createIntakePostHandler(dependencies, { requestId })(replayedRequest);
    }

    const parsed = parseAnalyzeRequest(body);
    if (!parsed.success) {
      return toApiErrorResponse("unprocessable_request", requestId);
    }
    const compatibleRequest = parseAnalyzeClaimRequest(body);
    if (!compatibleRequest.success) {
      return toApiErrorResponse("unprocessable_request", requestId);
    }

    const isBypass =
      parsed.data.intent === "correction_only" ||
      preflightGuard(parsed.data.message).status !== "pass";
    let lease: { release(): Promise<void> } | undefined;
    try {
      let guardedOpenAIExtractor = overrides.openaiExtractor;
      if (!isBypass && parsed.data.requestedMode === "gpt") {
        if (parsed.data.privacyAcknowledged !== true) {
          return toApiErrorResponse("gpt_access_denied", requestId);
        }
        const controls = overrides.gptControls ?? runtimeGptControls;
        const accessGranted = verifyDemoAccess({
          consent: true,
          suppliedCode: request.headers.get("x-demo-access-code"),
          configuredCode: overrides.demoAccessCode ?? process.env.DEMO_ACCESS_CODE
        });
        let identity;
        try {
          identity = controls.identityResolver.resolve(request);
        } catch {
          return toApiErrorResponse("budget_restricted", requestId);
        }
        let guard;
        try {
          guard = await (overrides.gptControls?.guard ?? overrides.gptGuard ?? guardGptRequest)({
            consent: true,
            accessGranted,
            identity,
            rateLimiter: controls.rateLimiter,
            concurrencyLimiter: controls.concurrencyLimiter,
            budget: controls.budget
          });
        } catch {
          return toApiErrorResponse("budget_restricted", requestId);
        }
        if (!guard.allowed) return toApiErrorResponse(guard.code, requestId);
        lease = guard.lease;
        guardedOpenAIExtractor ??=
          overrides.createOpenAIExtractor?.() ??
          (() => {
            const client = createPublicOpenAIClientFromEnv();
            return client ? new OpenAIRawFactExtractor(client) : undefined;
          })();
      }
      const dependencies = claimDependencies(
        { ...overrides, openaiExtractor: guardedOpenAIExtractor },
        requestId
      );
      const response = overrides.processRequest
        ? await overrides.processRequest(compatibleRequest.data, dependencies)
        : canonicalIntakeResponse(await processClaimTurn(compatibleRequest.data, dependencies));
      if (
        !hasExactDomainProcessorResponseKeys(response) ||
        !hasValidExtractionMetadata(response, parsed.data)
      ) {
        return toApiErrorResponse("upstream_failure", requestId);
      }
      if (!isClaimStateReplayable(response.claimState)) {
        return toApiErrorResponse(
          parsed.data.intent === "correction_only" ? "unprocessable_request" : "upstream_failure",
          requestId
        );
      }
      return Response.json(response);
    } catch (error) {
      return toCaughtApiErrorResponse(error, requestId);
    } finally {
      try {
        await lease?.release();
      } catch {
        /* safe response wins */
      }
    }
  };
}
