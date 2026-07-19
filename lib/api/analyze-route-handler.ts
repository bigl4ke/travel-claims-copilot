import { processClaimTurn, type ProcessClaimDependencies } from "../claim-workflow";
import { buildAnalysisViewModel } from "../analysis-view-model";
import { createKnowledgeRepository } from "../knowledge/knowledge-repository";
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
import { preflightGuard } from "../domain/safety-guard";
import {
  hasExactDomainProcessorResponseKeys,
  parseAnalyzeClaimRequest,
  parseAnalyzeRequest,
  parseExtractionMetadata,
  type AnalyzeClaimResponse,
  type ParsedAnalyzeRequest
} from "./analyze-contract";
import {
  toApiErrorResponse,
  toCaughtApiErrorResponse,
  withRequestId,
  type RequestIdFactory
} from "./api-response";
import { isClaimStateReplayable, readJsonBody } from "./request-body";

type RouteTelemetryDependencies = Omit<
  NonNullable<ProcessClaimDependencies["telemetry"]>,
  "requestId"
>;

export type AnalyzeRouteDependencies = Omit<Partial<ProcessClaimDependencies>, "telemetry"> & {
  processRequest?: typeof processClaimTurn;
  requestIdFactory?: RequestIdFactory;
  telemetry?: RouteTelemetryDependencies;
  gptGuard?: typeof guardGptRequest;
  createOpenAIExtractor?: () => ProcessClaimDependencies["openaiExtractor"] | undefined;
  demoAccessCode?: string;
  gptControls?: {
    identityResolver: TrustedClientIdentityResolver;
    rateLimiter: RateLimiter;
    concurrencyLimiter: ConcurrencyLimiter;
    budget: BudgetGate;
    guard?: typeof guardGptRequest;
  };
};

function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function lazyLocalExtractor(): ProcessClaimDependencies["localExtractor"] {
  return {
    provider: "local",
    model: null,
    async extract(input) {
      return new LocalRawFactExtractor().extract(input);
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

export function createAnalyzeRouteHandler(overrides: AnalyzeRouteDependencies = {}) {
  return async function analyzePost(request: Request): Promise<Response> {
    const requestId = withRequestId(overrides.requestIdFactory);
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      return toCaughtApiErrorResponse(error, requestId);
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
      const asOf = overrides.now?.() ?? currentUtcDate();
      const dependencies: ProcessClaimDependencies = {
        localExtractor: overrides.localExtractor ?? lazyLocalExtractor(),
        ...(guardedOpenAIExtractor ? { openaiExtractor: guardedOpenAIExtractor } : {}),
        knowledgeRepository: overrides.knowledgeRepository ?? createKnowledgeRepository({ asOf }),
        now: () => asOf,
        ...(overrides.retrievalLimits ? { retrievalLimits: overrides.retrievalLimits } : {}),
        ...(overrides.telemetry ? { telemetry: { ...overrides.telemetry, requestId } } : {})
      };
      const processRequest = overrides.processRequest ?? processClaimTurn;
      const response = await processRequest(compatibleRequest.data, dependencies);
      if (
        !hasExactDomainProcessorResponseKeys(response) ||
        !hasValidExtractionMetadata(response, parsed.data)
      ) {
        return toApiErrorResponse("upstream_failure", requestId);
      }
      if (response.baseRevision !== parsed.data.baseRevision) {
        return toApiErrorResponse("upstream_failure", requestId);
      }
      if (!isClaimStateReplayable(response.claimState)) {
        return toApiErrorResponse(
          parsed.data.intent === "correction_only" ? "unprocessable_request" : "upstream_failure",
          requestId
        );
      }
      if (response.claimState.revision !== response.result.factsRevision) {
        return toApiErrorResponse("upstream_failure", requestId);
      }
      const publicResponse = {
        baseRevision: response.baseRevision,
        claimState: response.claimState,
        result: buildAnalysisViewModel({
          assessment: response.result,
          context: response.context,
          claimState: response.claimState
        })
      } satisfies AnalyzeClaimResponse;
      return Response.json(publicResponse);
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
