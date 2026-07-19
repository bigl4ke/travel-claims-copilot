import { processClaimTurn, type ProcessClaimDependencies } from "../claim-workflow";
import { createKnowledgeRepository } from "../knowledge/knowledge-repository";
import { LocalRawFactExtractor } from "../model/raw-fact-extractor";
import { preflightGuard } from "../domain/safety-guard";
import {
  hasExactCanonicalResponseKeys,
  parseAnalyzeClaimRequest,
  parseAnalyzeRequest,
  parseExtractionMetadata,
  type ParsedAnalyzeRequest
} from "./analyze-contract";
import { toApiErrorResponse, withRequestId, type RequestIdFactory } from "./api-response";
import { isClaimStateReplayable, readJsonBody } from "./request-body";

type RouteTelemetryDependencies = Omit<
  NonNullable<ProcessClaimDependencies["telemetry"]>,
  "requestId"
>;

export type AnalyzeRouteDependencies = Omit<Partial<ProcessClaimDependencies>, "telemetry"> & {
  processRequest?: typeof processClaimTurn;
  requestIdFactory?: RequestIdFactory;
  telemetry?: RouteTelemetryDependencies;
};

function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
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
      return toApiErrorResponse(error, requestId);
    }

    const parsed = parseAnalyzeRequest(body);
    if (!parsed.success) {
      return toApiErrorResponse("unprocessable_request", requestId);
    }
    const compatibleRequest = parseAnalyzeClaimRequest(body);
    if (!compatibleRequest.success) {
      return toApiErrorResponse("unprocessable_request", requestId);
    }

    const asOf = overrides.now?.() ?? currentUtcDate();
    const dependencies: ProcessClaimDependencies = {
      localExtractor: overrides.localExtractor ?? new LocalRawFactExtractor(),
      ...(overrides.openaiExtractor ? { openaiExtractor: overrides.openaiExtractor } : {}),
      knowledgeRepository: overrides.knowledgeRepository ?? createKnowledgeRepository({ asOf }),
      now: () => asOf,
      ...(overrides.retrievalLimits ? { retrievalLimits: overrides.retrievalLimits } : {}),
      ...(overrides.telemetry ? { telemetry: { ...overrides.telemetry, requestId } } : {})
    };
    try {
      const processRequest = overrides.processRequest ?? processClaimTurn;
      const response = await processRequest(compatibleRequest.data, dependencies);
      if (
        !hasExactCanonicalResponseKeys(response) ||
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
      return toApiErrorResponse(error, requestId);
    }
  };
}
