import { describe, expect, it, vi } from "vitest";

import * as intakeRoute from "../../app/api/intake/route";
import * as analyzeContract from "../../lib/api/analyze-contract";
import * as requestBodyContract from "../../lib/api/request-body";
import { ApiFault } from "../../lib/api/api-error";
import { createAnalyzeRouteHandler } from "../../lib/api/analyze-route-handler";
import { createIntakeRouteHandler } from "../../lib/api/intake-route-handler";
import { MemoryConcurrencyLimiter } from "../../lib/limits/concurrency-limiter";
import { createLocalTrustedIdentityResolver } from "../../lib/limits/gpt-request-guard";
import { MemoryRateLimiter } from "../../lib/limits/rate-limiter";
import { emptyClaimFacts } from "../../lib/claimFacts";
import {
  RAW_FACT_PATHS,
  type ExtractionMetadata,
  type RawFactPatch,
  type RawFactPath,
  type RawFactValue
} from "../../lib/domain/claim-contract";
import { mergeRawFacts } from "../../lib/domain/fact-merge";
import type { KnowledgeRepository } from "../../lib/knowledge/knowledge-contract";
import type { RawFactExtractor } from "../../lib/model/raw-fact-extractor";
import { knowledgeSnapshotFixture } from "../fixtures/knowledge";
import { claimState } from "../fixtures/raw-claims";

type RouteDependencies = {
  localExtractor: RawFactExtractor;
  openaiExtractor?: RawFactExtractor;
  knowledgeRepository: KnowledgeRepository;
  now: () => string;
  demoAccessCode?: string;
  gptControls?: object;
  processRequest?: (value: unknown, dependencies: unknown) => Promise<unknown>;
};

type RouteFactory = (dependencies: RouteDependencies) => (request: Request) => Promise<Response>;

type AnalyzeParseResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; errors: string[] };

type MetadataParseResult =
  | { success: true; data: ExtractionMetadata }
  | { success: false; errors: string[] };

function routeHarness(
  route: "analyze" | "intake",
  processRequest?: RouteDependencies["processRequest"]
) {
  const localExtract = vi.fn().mockResolvedValue({ set: {} });
  const openaiExtract = vi.fn().mockResolvedValue({ set: {} });
  const load = vi.fn().mockResolvedValue(knowledgeSnapshotFixture());
  const localExtractor = {
    provider: "local",
    model: null,
    extract: localExtract
  } satisfies RawFactExtractor;
  const openaiExtractor = {
    provider: "openai",
    model: "gpt-5.6-luna",
    extract: openaiExtract
  } satisfies RawFactExtractor;
  const dependencies = {
    localExtractor,
    openaiExtractor,
    knowledgeRepository: { load },
    now: () => "2026-07-19",
    demoAccessCode: "test-access",
    gptControls: {
      identityResolver: createLocalTrustedIdentityResolver("harness"),
      rateLimiter: new MemoryRateLimiter(),
      concurrencyLimiter: new MemoryConcurrencyLimiter(),
      budget: {
        async check() {
          return { allowed: true };
        }
      }
    },
    ...(processRequest ? { processRequest } : {})
  } satisfies RouteDependencies;

  const factory = route === "analyze" ? createAnalyzeRouteHandler : createIntakeRouteHandler;
  const handler = (factory as unknown as RouteFactory)(dependencies);

  return { handler, localExtract, openaiExtract, load };
}

function jsonRequest(path: string, body: unknown, contentType = "application/json"): Request {
  const withConsent =
    body && typeof body === "object" && (body as Record<string, unknown>).requestedMode === "gpt"
      ? { ...(body as Record<string, unknown>), privacyAcknowledged: true }
      : body;
  return new Request(`http://localhost/api/${path}`, {
    method: "POST",
    headers: { "content-type": contentType, "x-demo-access-code": "test-access" },
    body: JSON.stringify(withConsent)
  });
}

function rawJsonRequest(path: string, body: string): Request {
  return new Request(`http://localhost/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
}

function streamedRequest(path: string, bytes: Uint8Array, contentType = "application/json") {
  const split = Math.floor(bytes.byteLength / 2);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, split));
      controller.enqueue(bytes.slice(split));
      controller.close();
    }
  });
  return new Request(`http://localhost/api/${path}`, {
    method: "POST",
    headers: { "content-type": contentType, "content-length": "1" },
    body,
    duplex: "half"
  } as RequestInit & { duplex: "half" });
}

function exactJsonBytes(size: number): Uint8Array {
  const prefix = '{"message":"';
  const suffix = '","prior":null,"baseRevision":0}';
  const padding = "x".repeat(size - prefix.length - suffix.length);
  const encoded = new TextEncoder().encode(`${prefix}${padding}${suffix}`);
  expect(encoded.byteLength).toBe(size);
  return encoded;
}

function parseAnalyze(value: unknown): AnalyzeParseResult {
  const parser =
    (Reflect.get(analyzeContract, "parseAnalyzeRequest") as
      | ((candidate: unknown) => AnalyzeParseResult)
      | undefined) ??
    (analyzeContract.parseAnalyzeClaimRequest as unknown as (
      candidate: unknown
    ) => AnalyzeParseResult);
  return parser(value);
}

function parseMetadata(value: unknown): MetadataParseResult {
  const parser = Reflect.get(analyzeContract, "parseExtractionMetadata") as
    | ((candidate: unknown) => MetadataParseResult)
    | undefined;
  expect(parser, "parseExtractionMetadata must be exported").toBeTypeOf("function");
  if (!parser) return { success: false, errors: ["missing parser"] };
  return parser(value);
}

const canonicalPrior = () => claimState();

const twentyOneBooleanFactPaths = [
  "userInitiatedChange",
  "isOvernight",
  "assistance.refundOffered",
  "assistance.refundAccepted",
  "assistance.creditOffered",
  "assistance.creditAccepted",
  "assistance.reroutingOffered",
  "assistance.reroutingAccepted",
  "assistance.replacementTravelOffered",
  "assistance.replacementTravelAccepted",
  "assistance.lodgingOffered",
  "assistance.lodgingAccepted",
  "assistance.mealsOffered",
  "assistance.mealsAccepted",
  "assistance.groundTransportOffered",
  "assistance.groundTransportAccepted",
  "oversalesConfirmed",
  "confirmedReservation",
  "checkedInOnTime",
  "atGateOnTime",
  "documentsCompliant"
] as const satisfies readonly RawFactPath[];

function twentyOneSetOperations(): Record<string, boolean> {
  return Object.fromEntries(twentyOneBooleanFactPaths.map((path) => [path, true]));
}

const booleanFactPaths: ReadonlySet<RawFactPath> = new Set([
  ...twentyOneBooleanFactPaths,
  "confirmedHotelReservation",
  "qualifyingHotelReservation",
  "membershipAttached",
  "wasWalked",
  "replacementLodgingProvided"
]);
const integerFactPaths: ReadonlySet<RawFactPath> = new Set([
  "finalArrivalDelayMinutes",
  "cancellationNoticeHours",
  "replacementArrivalDelayMinutes"
]);

function extremeArrayItem(index: number, alternate: boolean): string {
  const prefix = `${alternate ? "b" : "a"}${index.toString().padStart(2, "0")}`;
  return prefix.padEnd(256, alternate ? "b" : "a");
}

function extremeRawFactValue(path: RawFactPath, alternate: boolean): RawFactValue {
  switch (path) {
    case "incidentType":
      return alternate ? "airline_cancellation" : "airline_delay";
    case "providerType":
      return alternate ? "hotel" : "airline";
    case "reasonCategory":
      return alternate ? "crew" : "weather";
    case "deniedBoardingKind":
      return alternate ? "voluntary" : "involuntary";
    case "bookingChannel":
      return alternate ? "ota" : "direct";
    case "expenses":
    case "evidence":
      return Array.from({ length: 20 }, (_, index) => extremeArrayItem(index, alternate));
    case "userGoal":
      return (alternate ? "secondary_state_marker_" : "primary_state_marker_").padEnd(
        500,
        alternate ? "b" : "a"
      );
    default:
      if (booleanFactPaths.has(path)) return !alternate;
      if (integerFactPaths.has(path)) return alternate ? 2 : 1;
      return (alternate ? "secondary_state_marker_" : "primary_state_marker_").padEnd(
        256,
        alternate ? "b" : "a"
      );
  }
}

function extremePatch(alternate: boolean): RawFactPatch {
  return {
    set: Object.fromEntries(
      RAW_FACT_PATHS.map((path) => [path, extremeRawFactValue(path, alternate)])
    ) as RawFactPatch["set"]
  };
}

function oversizedMergedClaimState() {
  return mergeRawFacts({
    prior: canonicalPrior(),
    baseRevision: 0,
    deterministicPatch: extremePatch(false),
    openaiPatch: extremePatch(true)
  }).state;
}

function canonicalProcessorResponse(extraction: unknown) {
  const state = canonicalPrior();
  return {
    baseRevision: 0,
    claimState: state,
    result: {
      status: "out_of_scope",
      primaryScenario: null,
      scenarioIds: [],
      factsRevision: state.revision,
      factsUsed: [],
      missingFacts: [],
      legalRegimes: [],
      extraction,
      assessments: [],
      retrieval: {
        policyApplicability: [],
        displayedPolicies: [],
        displayedCases: [],
        displayedScripts: []
      },
      cautions: [] as string[],
      nextActions: []
    },
    context: null
  };
}

function deeplyNestedLegacyJson(kind: "record" | "array"): string {
  const nested =
    kind === "record"
      ? `${'{"x":'.repeat(5_200)}null${"}".repeat(5_200)}`
      : `${"[".repeat(12_000)}null${"]".repeat(12_000)}`;
  const body = `{"message":"A bounded legacy message.","facts":{"x":${nested}}}`;
  expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(32 * 1_024);
  return body;
}

function nonFiniteLegacyJson(): string {
  const facts = JSON.stringify(emptyClaimFacts()).replace(
    '"arrivalDelayMinutes":null',
    '"arrivalDelayMinutes":1e309'
  );
  expect(facts).toContain('"arrivalDelayMinutes":1e309');
  return `{"message":"A bounded legacy message.","facts":${facts}}`;
}

describe("claim-state replay budget", () => {
  it("accepts a small state and safely rejects oversized, invalid, and cyclic values", () => {
    const checker = Reflect.get(requestBodyContract, "isClaimStateReplayable") as
      | ((state: unknown) => boolean)
      | undefined;
    expect(checker, "isClaimStateReplayable must be exported").toBeTypeOf("function");
    if (!checker) return;

    const oversizedState = oversizedMergedClaimState();
    const replayRequest = {
      message: "x",
      prior: oversizedState,
      baseRevision: oversizedState.revision
    };
    const replayBytes = new TextEncoder().encode(JSON.stringify(replayRequest)).byteLength;
    const cyclicState = { revision: 0 } as Record<string, unknown>;
    cyclicState.self = cyclicState;

    expect(parseAnalyze(replayRequest).success).toBe(true);
    expect(replayBytes).toBeGreaterThan(32 * 1_024);
    expect(checker(canonicalPrior())).toBe(true);
    expect(checker(oversizedState)).toBe(false);
    expect(checker({ revision: 0 })).toBe(false);
    expect(checker(cyclicState)).toBe(false);
  });
});

describe.each(["analyze", "intake"] as const)("bounded %s route", (route) => {
  it("returns 415 for a canonical body without a JSON media type", async () => {
    const harness = routeHarness(route);
    const response = await harness.handler(
      jsonRequest(
        route,
        { message: "A bounded initial message.", prior: canonicalPrior(), baseRevision: 0 },
        "text/plain"
      )
    );

    expect(response.status).toBe(415);
    expect(harness.localExtract).not.toHaveBeenCalled();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON and invalid UTF-8", async () => {
    const invalidJsonHarness = routeHarness(route);
    const invalidJson = await invalidJsonHarness.handler(
      streamedRequest(route, new TextEncoder().encode("{not-json"))
    );
    expect(invalidJson.status).toBe(400);
    expect(invalidJsonHarness.localExtract).not.toHaveBeenCalled();
    expect(invalidJsonHarness.openaiExtract).not.toHaveBeenCalled();
    expect(invalidJsonHarness.load).not.toHaveBeenCalled();

    const invalidUtf8Harness = routeHarness(route);
    const invalidUtf8 = await invalidUtf8Harness.handler(
      streamedRequest(route, new Uint8Array([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d]))
    );
    expect(invalidUtf8.status).toBe(400);
    expect(invalidUtf8Harness.localExtract).not.toHaveBeenCalled();
    expect(invalidUtf8Harness.openaiExtract).not.toHaveBeenCalled();
    expect(invalidUtf8Harness.load).not.toHaveBeenCalled();
  });

  it("returns 413 for 32,769 streamed bytes despite a false small Content-Length", async () => {
    const harness = routeHarness(route);
    const response = await harness.handler(streamedRequest(route, exactJsonBytes(32_769)));

    expect(response.status).toBe(413);
    expect(harness.localExtract).not.toHaveBeenCalled();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });

  it("awaits stream cancellation before returning a 413", async () => {
    const harness = routeHarness(route);
    let cancelStarted = false;
    let finishCancel: (() => void) | undefined;
    const cancelCompletion = new Promise<void>((resolve) => {
      finishCancel = resolve;
    });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(32_769));
      },
      cancel() {
        cancelStarted = true;
        return cancelCompletion;
      }
    });
    const request = new Request(`http://localhost/api/${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half"
    } as RequestInit & { duplex: "half" });

    let settled = false;
    const responsePromise = harness.handler(request).then((response) => {
      settled = true;
      return response;
    });
    await vi.waitFor(() => expect(cancelStarted).toBe(true));
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    const settledBeforeCancellation = settled;
    finishCancel?.();
    const response = await responsePromise;

    expect(settledBeforeCancellation).toBe(false);
    expect(response.status).toBe(413);
    expect(harness.localExtract).not.toHaveBeenCalled();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });

  it.each([
    [
      "4,001 message code points",
      { message: "😀".repeat(4_001), prior: canonicalPrior(), baseRevision: 0 }
    ],
    [
      "a 257-code-point ordinary field",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { provider: "é".repeat(257) }, clear: [] }
      }
    ],
    [
      "a 257-code-point ordinary field before trimming",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { provider: ` ${"é".repeat(255)} ` }, clear: [] }
      }
    ],
    [
      "a 501-code-point user goal",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { userGoal: "目".repeat(501) }, clear: [] }
      }
    ],
    [
      "a 21-item value array",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: {
          set: { evidence: Array.from({ length: 21 }, (_, index) => `${index}`) },
          clear: []
        }
      }
    ],
    [
      "a 257-code-point array item",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { expenses: ["😀".repeat(257)] }, clear: [] }
      }
    ]
  ])("returns 422 for %s before any cost-bearing work", async (_label, body) => {
    const harness = routeHarness(route);
    const response = await harness.handler(jsonRequest(route, body));

    expect(response.status).toBe(422);
    expect(harness.localExtract).not.toHaveBeenCalled();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });

  it.each([
    [
      "21 correction.set paths",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: twentyOneSetOperations(), clear: [] }
      }
    ],
    [
      "21 combined correction operations",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: {
          set: Object.fromEntries(
            twentyOneBooleanFactPaths.slice(0, 20).map((path) => [path, true])
          ),
          clear: [twentyOneBooleanFactPaths[20]]
        }
      }
    ]
  ])("returns 422 for %s before any cost-bearing work", async (_label, body) => {
    const harness = routeHarness(route);
    const response = await harness.handler(jsonRequest(route, body));

    expect(response.status).toBe(422);
    expect(harness.localExtract).not.toHaveBeenCalled();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });

  it("round-trips a server-generated claim state with 21 provenance entries", async () => {
    const harness = routeHarness(route);
    harness.localExtract
      .mockResolvedValueOnce({ set: twentyOneSetOperations() })
      .mockResolvedValueOnce({ set: {} });

    const firstResponse = await harness.handler(
      jsonRequest(route, {
        message: "My travel claim has new bounded facts.",
        prior: canonicalPrior(),
        baseRevision: 0
      })
    );
    const firstBody = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(Object.keys(firstBody.claimState.provenance)).toHaveLength(21);

    const secondResponse = await harness.handler(
      jsonRequest(route, {
        message: "My travel claim has another bounded update.",
        prior: firstBody.claimState,
        baseRevision: firstBody.claimState.revision
      })
    );

    expect(secondResponse.status).toBe(200);
    expect(harness.localExtract).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "initial",
      {
        message: "A bounded initial message.",
        prior: canonicalPrior(),
        baseRevision: 0,
        requestedMode: "local"
      },
      {
        performed: true,
        requestedMode: "local",
        provider: "local",
        model: null
      },
      502
    ],
    [
      "correction-only",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: [] },
        requestedMode: "local"
      },
      {
        performed: false,
        requestedMode: "local",
        provider: null,
        model: null,
        notRunReason: "correction_only"
      },
      422
    ]
  ])(
    "rejects an unreplayable processor claimState for a canonical %s request",
    async (_label, requestBody, extraction, expectedStatus) => {
      const processorResponse = canonicalProcessorResponse(extraction as ExtractionMetadata);
      processorResponse.claimState = oversizedMergedClaimState();
      const processRequest = vi.fn().mockResolvedValue(processorResponse);
      const harness = routeHarness(route, processRequest);
      const response = await harness.handler(jsonRequest(route, requestBody));
      const body = await response.json();

      expect(processRequest).toHaveBeenCalledOnce();
      expect(response.status).toBe(expectedStatus);
      expect(body).not.toHaveProperty("claimState");
      expect(JSON.stringify(body)).not.toContain("primary_state_marker_");
      expect(harness.localExtract).not.toHaveBeenCalled();
      expect(harness.openaiExtract).not.toHaveBeenCalled();
      expect(harness.load).not.toHaveBeenCalled();
    }
  );

  it.each(["top-level privateDetail", "result debug siblings"])(
    "rejects a canonical processor response with extra %s",
    async (variant) => {
      const privateMarker = "canonical_response_private_marker";
      const processorResponse = canonicalProcessorResponse({
        performed: true,
        requestedMode: "local",
        provider: "local",
        model: null
      }) as Record<string, unknown> & { result: Record<string, unknown> };
      if (variant === "top-level privateDetail") {
        processorResponse.privateDetail = privateMarker;
      } else {
        processorResponse.result.debugSecret = privateMarker;
        processorResponse.result.internalError = "private_internal_error";
      }
      const processRequest = vi.fn().mockResolvedValue(processorResponse);
      const harness = routeHarness(route, processRequest);
      const response = await harness.handler(
        jsonRequest(route, {
          message: "A bounded initial message.",
          prior: canonicalPrior(),
          baseRevision: 0,
          requestedMode: "local"
        })
      );
      const body = await response.json();

      expect(processRequest).toHaveBeenCalledOnce();
      expect(response.status).toBe(502);
      expect(body).not.toHaveProperty("claimState");
      expect(JSON.stringify(body)).not.toContain(privateMarker);
      expect(JSON.stringify(body)).not.toContain("private_internal_error");
      expect(harness.localExtract).not.toHaveBeenCalled();
      expect(harness.openaiExtract).not.toHaveBeenCalled();
      expect(harness.load).not.toHaveBeenCalled();
    }
  );

  it.each(["top-level context", "result nextActions"])(
    "rejects a canonical processor response missing required %s",
    async (variant) => {
      const privateMarker = "missing_response_key_private_marker";
      const processorResponse = canonicalProcessorResponse({
        performed: true,
        requestedMode: "local",
        provider: "local",
        model: null
      }) as Record<string, unknown> & { result: Record<string, unknown> };
      processorResponse.result.cautions = [privateMarker];
      if (variant === "top-level context") {
        delete processorResponse.context;
      } else {
        delete processorResponse.result.nextActions;
      }
      const processRequest = vi.fn().mockResolvedValue(processorResponse);
      const harness = routeHarness(route, processRequest);
      const response = await harness.handler(
        jsonRequest(route, {
          message: "A bounded initial message.",
          prior: canonicalPrior(),
          baseRevision: 0,
          requestedMode: "local"
        })
      );
      const body = await response.json();

      expect(processRequest).toHaveBeenCalledOnce();
      expect(response.status).toBe(502);
      expect(body).not.toHaveProperty("claimState");
      expect(JSON.stringify(body)).not.toContain(privateMarker);
      expect(harness.localExtract).not.toHaveBeenCalled();
      expect(harness.openaiExtract).not.toHaveBeenCalled();
      expect(harness.load).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["blank initial message", { message: " ", prior: canonicalPrior(), baseRevision: 0 }],
    [
      "message plus correction",
      {
        message: "new facts",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: [] }
      }
    ],
    [
      "whitespace correction message",
      {
        message: " ",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: [] }
      }
    ],
    [
      "empty correction",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: {}, clear: [] }
      }
    ],
    [
      "null correction set",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { provider: null }, clear: [] }
      }
    ],
    [
      "duplicate clear",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: {}, clear: ["provider", "provider"] }
      }
    ],
    [
      "set-clear overlap",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: ["provider"] }
      }
    ],
    [
      "unknown clear path",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: {}, clear: ["origin.region"] }
      }
    ]
  ])("returns 422 for the invalid intent matrix case: %s", async (_label, body) => {
    const harness = routeHarness(route);
    const response = await harness.handler(jsonRequest(route, body));

    expect(response.status).toBe(422);
    expect(harness.localExtract).not.toHaveBeenCalled();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });

  it("fails closed when the processor returns mixed, private extraction metadata", async () => {
    const processRequest = vi.fn().mockResolvedValue(
      canonicalProcessorResponse({
        performed: true,
        requestedMode: "gpt",
        provider: "openai",
        model: "gpt-5.6-luna",
        fallbackReason: "private upstream detail"
      })
    );
    const harness = routeHarness(route, processRequest);
    const response = await harness.handler(
      jsonRequest(route, {
        message: "A valid bounded initial message.",
        prior: canonicalPrior(),
        baseRevision: 0,
        requestedMode: "gpt"
      })
    );
    const body = await response.json();

    expect(processRequest).toHaveBeenCalledOnce();
    expect(response.status).toBe(502);
    expect(JSON.stringify(body)).not.toContain("private upstream detail");
    expect(harness.localExtract).not.toHaveBeenCalled();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });

  it.each([
    [
      "preflight metadata for a correction-only request",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: [] },
        requestedMode: "gpt"
      },
      {
        performed: false,
        requestedMode: "gpt",
        provider: null,
        model: null,
        notRunReason: "preflight_guard"
      }
    ],
    [
      "correction-only metadata for an initial request",
      {
        message: "A bounded initial message.",
        prior: canonicalPrior(),
        baseRevision: 0,
        requestedMode: "gpt"
      },
      {
        performed: false,
        requestedMode: "gpt",
        provider: null,
        model: null,
        notRunReason: "correction_only"
      }
    ],
    [
      "performed metadata for a correction-only request",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: [] },
        requestedMode: "local"
      },
      {
        performed: true,
        requestedMode: "local",
        provider: "local",
        model: null
      }
    ],
    [
      "preflight metadata for an unguarded initial request",
      {
        message: "A bounded initial message.",
        prior: canonicalPrior(),
        baseRevision: 0,
        requestedMode: "local"
      },
      {
        performed: false,
        requestedMode: "local",
        provider: null,
        model: null,
        notRunReason: "preflight_guard"
      }
    ]
  ])("fails closed on %s", async (_label, requestBody, extraction) => {
    const processRequest = vi.fn().mockResolvedValue(canonicalProcessorResponse(extraction));
    const harness = routeHarness(route, processRequest);
    const response = await harness.handler(jsonRequest(route, requestBody));

    expect(processRequest).toHaveBeenCalledOnce();
    expect(response.status).toBe(502);
    expect(harness.localExtract).not.toHaveBeenCalled();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });

  it.each([
    [
      "explicit local request with gpt metadata",
      {
        message: "A bounded initial message.",
        prior: canonicalPrior(),
        baseRevision: 0,
        requestedMode: "local"
      },
      {
        performed: true,
        requestedMode: "gpt",
        provider: "openai",
        model: "gpt-5.6-luna"
      }
    ],
    [
      "explicit gpt request with local metadata",
      {
        message: "A bounded initial message.",
        prior: canonicalPrior(),
        baseRevision: 0,
        requestedMode: "gpt"
      },
      {
        performed: true,
        requestedMode: "local",
        provider: "local",
        model: null
      }
    ],
    [
      "default local request with gpt metadata",
      {
        message: "A bounded initial message.",
        prior: canonicalPrior(),
        baseRevision: 0
      },
      {
        performed: true,
        requestedMode: "gpt",
        provider: "openai",
        model: "gpt-5.6-luna"
      }
    ]
  ])("fails closed on requestedMode mismatch: %s", async (_label, requestBody, extraction) => {
    const privateMarker = "requested_mode_mismatch_private_marker";
    const processorResponse = canonicalProcessorResponse(extraction);
    processorResponse.result.cautions = [privateMarker];
    const processRequest = vi.fn().mockResolvedValue(processorResponse);
    const harness = routeHarness(route, processRequest);
    const response = await harness.handler(jsonRequest(route, requestBody));
    const body = await response.json();

    expect(processRequest).toHaveBeenCalledOnce();
    expect(response.status).toBe(502);
    expect(JSON.stringify(body)).not.toContain(privateMarker);
    expect(harness.localExtract).not.toHaveBeenCalled();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });

  it.each([
    ["Local", "local", { performed: true, requestedMode: "local", provider: "local", model: null }],
    [
      "OpenAI",
      "gpt",
      {
        performed: true,
        requestedMode: "gpt",
        provider: "openai",
        model: "gpt-5.6-luna"
      }
    ]
  ])(
    "fails closed when a genuinely guarded initial returns performed %s metadata",
    async (_label, requestedMode, extraction) => {
      const privateMarker = "customer_alice_high_risk_private_marker";
      const processorResponse = canonicalProcessorResponse(extraction);
      processorResponse.result.cautions = [privateMarker];
      const processRequest = vi.fn().mockResolvedValue(processorResponse);
      const harness = routeHarness(route, processRequest);
      const response = await harness.handler(
        jsonRequest(route, {
          message: "There is an active fire and I need emergency help",
          prior: canonicalPrior(),
          baseRevision: 0,
          requestedMode
        })
      );
      const body = await response.json();

      expect(processRequest).toHaveBeenCalledOnce();
      expect(response.status).toBe(502);
      expect(JSON.stringify(body)).not.toContain(privateMarker);
      expect(harness.localExtract).not.toHaveBeenCalled();
      expect(harness.openaiExtract).not.toHaveBeenCalled();
      expect(harness.load).not.toHaveBeenCalled();
    }
  );
});

describe("canonical request intent and limits", () => {
  it("returns explicit initial and correction-only discriminants without rewriting message text", () => {
    const message = "  Keep my spacing and punctuation!  ";
    const initial = parseAnalyze({ message, prior: canonicalPrior(), baseRevision: 0 });
    const correctionOnly = parseAnalyze({
      message: "",
      prior: canonicalPrior(),
      baseRevision: 0,
      correction: { set: { provider: "Delta" }, clear: [] }
    });

    expect(initial.success).toBe(true);
    expect(correctionOnly.success).toBe(true);
    if (!initial.success || !correctionOnly.success) return;
    expect(initial.data).toMatchObject({ intent: "initial", message });
    expect(correctionOnly.data).toMatchObject({ intent: "correction_only", message: "" });
  });

  it("accepts exact Unicode, string, and collection boundaries", () => {
    const initial = parseAnalyze({
      message: "😀".repeat(4_000),
      prior: canonicalPrior(),
      baseRevision: 0
    });
    const correctionOnly = parseAnalyze({
      message: "",
      prior: canonicalPrior(),
      baseRevision: 0,
      correction: {
        set: {
          provider: "é".repeat(256),
          userGoal: "目".repeat(500),
          evidence: Array.from({ length: 20 }, (_, index) => `${index}-${"😀".repeat(253)}`)
        },
        clear: []
      }
    });

    expect(initial.success).toBe(true);
    expect(correctionOnly.success).toBe(true);
  });

  it.each([
    ["blank initial message", { message: "  ", prior: canonicalPrior(), baseRevision: 0 }],
    [
      "nonblank message with a correction",
      {
        message: "new facts",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: [] }
      }
    ],
    [
      "whitespace correction message",
      {
        message: " ",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: [] }
      }
    ],
    [
      "empty correction",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: {}, clear: [] }
      }
    ],
    [
      "null user set",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { provider: null }, clear: [] }
      }
    ],
    [
      "duplicate clear",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: {}, clear: ["provider", "provider"] }
      }
    ],
    [
      "set-clear overlap",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: ["provider"] }
      }
    ],
    [
      "too many clear paths",
      {
        message: "",
        prior: canonicalPrior(),
        baseRevision: 0,
        correction: {
          set: {},
          clear: [
            "provider",
            "brandOrProperty",
            "operatingCarrier",
            "origin.city",
            "origin.airport",
            "origin.country",
            "destination.city",
            "destination.airport",
            "destination.country",
            "statedReason",
            "scheduledFinalArrival",
            "actualFinalArrival",
            "loyaltyStatus",
            "userGoal",
            "incidentType",
            "providerType",
            "reasonCategory",
            "bookingChannel",
            "deniedBoardingKind",
            "finalArrivalDelayMinutes",
            "isOvernight"
          ]
        }
      }
    ],
    [
      "unknown request key",
      { message: "new facts", prior: canonicalPrior(), baseRevision: 0, debug: true }
    ],
    [
      "unknown nested facts key",
      {
        message: "new facts",
        prior: {
          ...canonicalPrior(),
          facts: { ...canonicalPrior().facts, internalRegion: "US" }
        },
        baseRevision: 0
      }
    ],
    [
      "derived scenario and location keys at the public boundary",
      {
        message: "new facts",
        prior: {
          ...canonicalPrior(),
          facts: {
            ...canonicalPrior().facts,
            scenarioId: "eu_uk_air_disruption",
            origin: { ...canonicalPrior().facts.origin, region: "EU_EEA_CH" }
          }
        },
        baseRevision: 0
      }
    ],
    [
      "unknown assistance key at the public boundary",
      {
        message: "new facts",
        prior: {
          ...canonicalPrior(),
          facts: {
            ...canonicalPrior().facts,
            assistance: { ...canonicalPrior().facts.assistance, internalRefundCode: "private" }
          }
        },
        baseRevision: 0
      }
    ]
  ])("rejects %s", (_label, value) => {
    expect(parseAnalyze(value).success).toBe(false);
  });

  it.each(["analyze", "intake"] as const)(
    "runs a valid correction-only %s request without either extractor",
    async (route) => {
      const harness = routeHarness(route);
      const response = await harness.handler(
        jsonRequest(route, {
          message: "",
          prior: canonicalPrior(),
          baseRevision: 0,
          correction: { set: { provider: "Delta" }, clear: [] },
          requestedMode: "gpt"
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.result.extraction).toEqual({
        performed: false,
        requestedMode: "gpt",
        provider: null,
        model: null,
        notRunReason: "correction_only"
      });
      expect(harness.localExtract).not.toHaveBeenCalled();
      expect(harness.openaiExtract).not.toHaveBeenCalled();
    }
  );

  it("labels a guarded initial request as preflight_guard without extractor or knowledge calls", async () => {
    const harness = routeHarness("analyze");
    const response = await harness.handler(
      jsonRequest("analyze", {
        message: "There is an active fire and I need emergency help",
        prior: canonicalPrior(),
        baseRevision: 0,
        requestedMode: "gpt"
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.extraction).toEqual({
      performed: false,
      requestedMode: "gpt",
      provider: null,
      model: null,
      notRunReason: "preflight_guard"
    });
    expect(harness.localExtract).not.toHaveBeenCalled();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });
});

describe("strict extraction metadata parsing", () => {
  it.each([
    {
      performed: false,
      requestedMode: "local",
      provider: null,
      model: null,
      notRunReason: "preflight_guard"
    },
    {
      performed: false,
      requestedMode: "gpt",
      provider: null,
      model: null,
      notRunReason: "correction_only"
    },
    {
      performed: true,
      requestedMode: "gpt",
      provider: "openai",
      model: "gpt-5.6-luna"
    },
    { performed: true, requestedMode: "local", provider: "local", model: null },
    {
      performed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "openai_extractor_unavailable"
    },
    {
      performed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "model_timeout"
    },
    {
      performed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "upstream_rate_limited"
    },
    {
      performed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "upstream_unavailable"
    },
    {
      performed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "invalid_model_json"
    },
    {
      performed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "invalid_model_schema"
    }
  ] satisfies ExtractionMetadata[])("accepts a legal metadata arm", (value) => {
    const parsed = parseMetadata(value);

    expect(parsed).toEqual({ success: true, data: value });
  });

  it.each([
    {
      performed: false,
      requestedMode: "local",
      provider: "local",
      model: null,
      notRunReason: "preflight_guard"
    },
    {
      performed: false,
      requestedMode: "gpt",
      provider: null,
      model: null,
      notRunReason: "correction_only",
      fallbackReason: "must-not-mix"
    },
    {
      performed: false,
      requestedMode: "local",
      provider: null,
      model: null,
      notRunReason: "not_a_reason"
    },
    {
      performed: true,
      requestedMode: "local",
      provider: "openai",
      model: "gpt-5.6-luna"
    },
    {
      performed: true,
      requestedMode: "gpt",
      provider: "openai",
      model: "wrong-model"
    },
    {
      performed: true,
      requestedMode: "local",
      provider: "local",
      model: null,
      fallbackReason: "must-not-mix"
    },
    { performed: true, requestedMode: "gpt", provider: "local", model: null },
    {
      performed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "   "
    },
    {
      performed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "private upstream detail"
    },
    {
      performed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "customer_alice_account_12345"
    },
    {
      performed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "upstream_unavailable",
      notRunReason: "preflight_guard"
    },
    {
      performed: true,
      requestedMode: "local",
      provider: "local",
      model: null,
      internalError: "private"
    }
  ])("rejects an illegal metadata combination without coercion", (value) => {
    const parsed = parseMetadata(value);

    expect(parsed.success).toBe(false);
  });
});

describe("legacy public intake compatibility", () => {
  it("continues to accept the bounded legacy facts request", async () => {
    const response = await intakeRoute.POST(
      jsonRequest("intake", {
        message: "My flight was delayed by 20 minutes.",
        facts: null
      })
    );

    expect(response.status).toBe(200);
  });

  it("still requires the legacy JSON body to declare its media type", async () => {
    const response = await intakeRoute.POST(
      jsonRequest(
        "intake",
        { message: "My flight was delayed by 20 minutes.", facts: null },
        "text/plain"
      )
    );

    expect(response.status).toBe(415);
  });

  it.each([
    ["4,001 message code points", { message: "😀".repeat(4_001), facts: null }],
    [
      "a 257-code-point ordinary field before trimming",
      {
        message: "A bounded legacy message.",
        facts: { ...emptyClaimFacts(), provider: ` ${"é".repeat(255)} ` }
      }
    ],
    [
      "a 501-code-point user goal",
      {
        message: "A bounded legacy message.",
        facts: { ...emptyClaimFacts(), userGoal: "目".repeat(501) }
      }
    ],
    [
      "a 21-item value array",
      {
        message: "A bounded legacy message.",
        facts: {
          ...emptyClaimFacts(),
          expenses: Array.from({ length: 21 }, (_, index) => `${index}`)
        }
      }
    ],
    [
      "a 257-code-point array item",
      {
        message: "A bounded legacy message.",
        facts: { ...emptyClaimFacts(), evidence: ["😀".repeat(257)] }
      }
    ]
  ])("returns 422 for legacy %s before constructing dependencies", async (_label, body) => {
    const harness = routeHarness("intake");
    const response = await harness.handler(jsonRequest("intake", body));

    expect(response.status).toBe(422);
    expect(harness.localExtract).not.toHaveBeenCalled();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a deeply nested record",
      () => deeplyNestedLegacyJson("record"),
      422,
      "unprocessable_request"
    ],
    ["a deeply nested array", () => deeplyNestedLegacyJson("array"), 422, "unprocessable_request"],
    ["a non-finite numeric token", nonFiniteLegacyJson, 422, "unprocessable_request"]
  ])(
    "returns a fixed safe 4xx for legacy %s without rejecting",
    async (_label, requestJson, expectedStatus, expectedCode) => {
      const harness = routeHarness("intake");
      const responsePromise = harness.handler(rawJsonRequest("intake", requestJson()));

      await expect(responsePromise).resolves.toBeInstanceOf(Response);
      const response = await responsePromise;

      expect(response.status).toBe(expectedStatus);
      expect(await response.json()).toEqual({
        error: {
          code: expectedCode,
          message: "Request could not be processed.",
          requestId: expect.any(String),
          retryable: false
        }
      });
      expect(harness.localExtract).not.toHaveBeenCalled();
      expect(harness.openaiExtract).not.toHaveBeenCalled();
      expect(harness.load).not.toHaveBeenCalled();
    }
  );
});

describe("API fault contract", () => {
  it("stores the third constructor argument as retryable", () => {
    const fault = new ApiFault("invalid_json", 400, false);

    expect(fault.retryable).toBe(false);
    expect(fault).not.toHaveProperty("expose");
  });
});
