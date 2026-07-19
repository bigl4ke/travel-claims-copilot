import { describe, expect, it, vi } from "vitest";

import { createAnalyzeRouteHandler } from "../../lib/api/analyze-route-handler";
import { createIntakeRouteHandler } from "../../lib/api/intake-route-handler";
import type { ApiErrorCode } from "../../lib/api/api-response";
import type { ExtractionMetadata } from "../../lib/domain/claim-contract";
import {
  MemoryConcurrencyLimiter,
  type ConcurrencyLimiter,
  type ConcurrencyLease
} from "../../lib/limits/concurrency-limiter";
import {
  createLocalTrustedIdentityResolver,
  guardGptRequest,
  type BudgetGate,
  type GptGuardResult,
  type TrustedClientIdentityResolver
} from "../../lib/limits/gpt-request-guard";
import { MemoryRateLimiter, type RateLimiter } from "../../lib/limits/rate-limiter";
import { ModelFailure } from "../../lib/model/model-error";
import type { RawFactExtractor } from "../../lib/model/raw-fact-extractor";
import type { SafeTelemetryEvent } from "../../lib/privacy/safe-telemetry";
import { knowledgeSnapshotFixture } from "../fixtures/knowledge";
import { claimState } from "../fixtures/raw-claims";

const DEMO_CODE = "synthetic-demo-access-value";

const routeFactories = [
  ["analyze", createAnalyzeRouteHandler],
  ["intake", createIntakeRouteHandler]
] as const;

const errorSpecs: Record<
  Extract<
    ApiErrorCode,
    | "gpt_access_denied"
    | "rate_limited"
    | "concurrency_limited"
    | "budget_restricted"
    | "model_refusal"
    | "upstream_failure"
  >,
  { status: number; message: string; retryable: boolean }
> = {
  gpt_access_denied: {
    status: 401,
    message: "GPT access is denied.",
    retryable: false
  },
  rate_limited: {
    status: 429,
    message: "Too many requests. Please try again later.",
    retryable: true
  },
  concurrency_limited: {
    status: 429,
    message: "Too many requests are in progress. Please try again later.",
    retryable: true
  },
  budget_restricted: {
    status: 429,
    message: "GPT analysis is temporarily restricted.",
    retryable: false
  },
  model_refusal: {
    status: 422,
    message: "The model could not process this request.",
    retryable: false
  },
  upstream_failure: {
    status: 502,
    message: "The analysis service is temporarily unavailable.",
    retryable: true
  }
};

const openaiExtraction = {
  performed: true,
  requestedMode: "gpt",
  provider: "openai",
  model: "gpt-5.6-luna"
} as const satisfies ExtractionMetadata;

const localFallbackExtraction = {
  performed: true,
  requestedMode: "gpt",
  provider: "local",
  model: null,
  fallbackReason: "openai_extractor_unavailable"
} as const satisfies ExtractionMetadata;

function canonicalGptResponse(extraction: ExtractionMetadata = localFallbackExtraction) {
  const state = claimState();
  return {
    baseRevision: 0,
    claimState: state,
    result: {
      status: "needs_information",
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
      cautions: [],
      nextActions: []
    },
    context: null
  };
}

function canonicalRequest(
  route: string,
  bodyOverrides: Record<string, unknown> = {},
  accessCode: string | null = DEMO_CODE,
  forwardedFor?: string
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (accessCode !== null) headers["x-demo-access-code"] = accessCode;
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  return new Request(`http://localhost/api/${route}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: "Synthetic bounded claim.",
      prior: claimState(),
      baseRevision: 0,
      requestedMode: "gpt",
      privacyAcknowledged: true,
      ...bodyOverrides
    })
  });
}

function localExtractor(extract = vi.fn().mockResolvedValue({ set: {} })) {
  return {
    provider: "local" as const,
    model: null,
    extract
  } satisfies RawFactExtractor;
}

function openaiExtractor(extract = vi.fn().mockResolvedValue({ set: {} })) {
  return {
    provider: "openai" as const,
    model: "gpt-5.6-luna" as const,
    extract
  } satisfies RawFactExtractor;
}

function freshControlSpies(
  options: {
    guard?: ReturnType<typeof vi.fn<typeof guardGptRequest>>;
    release?: ReturnType<typeof vi.fn<ConcurrencyLease["release"]>>;
  } = {}
) {
  const release = options.release ?? vi.fn<ConcurrencyLease["release"]>().mockResolvedValue();
  const resolve = vi.fn<TrustedClientIdentityResolver["resolve"]>(() => ({
    key: "synthetic-client",
    source: "local_test",
    globallyEnforceable: false
  }));
  const consume = vi.fn<RateLimiter["consume"]>().mockResolvedValue({
    allowed: true,
    retryAfterSeconds: 0
  });
  const acquire = vi
    .fn<ConcurrencyLimiter["acquire"]>()
    .mockResolvedValue({ release } satisfies ConcurrencyLease);
  const check = vi.fn<BudgetGate["check"]>().mockResolvedValue({ allowed: true });
  return {
    controls: {
      identityResolver: { resolve },
      rateLimiter: { consume },
      concurrencyLimiter: { acquire },
      budget: { check },
      ...(options.guard ? { guard: options.guard } : {})
    },
    resolve,
    consume,
    acquire,
    check,
    release
  };
}

async function expectExactError(
  response: Response,
  code: keyof typeof errorSpecs,
  requestId: string
): Promise<void> {
  const spec = errorSpecs[code];
  expect(response.status).toBe(spec.status);
  expect(await response.json()).toEqual({
    error: {
      code,
      message: spec.message,
      requestId,
      retryable: spec.retryable
    }
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe.each(routeFactories)("guarded %s route", (route, createHandler) => {
  it("rejects a whitespace-only configured and supplied demo code", async () => {
    const consume = vi.fn<RateLimiter["consume"]>().mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0
    });
    const acquire = vi.fn<ConcurrencyLimiter["acquire"]>().mockResolvedValue({
      release: vi.fn().mockResolvedValue(undefined)
    });
    const check = vi.fn<BudgetGate["check"]>().mockResolvedValue({ allowed: true });
    const processRequest = vi.fn().mockResolvedValue(canonicalGptResponse());
    const createOpenAIExtractor = vi.fn(() => undefined);
    const record = vi.fn<(event: SafeTelemetryEvent) => void>();
    const handler = createHandler({
      requestIdFactory: () => `req-whitespace-${route}`,
      demoAccessCode: "\u00a0",
      gptControls: {
        identityResolver: {
          resolve: () => ({
            key: "synthetic-client",
            source: "local_test" as const,
            globallyEnforceable: false
          })
        },
        rateLimiter: { consume },
        concurrencyLimiter: { acquire },
        budget: { check }
      },
      processRequest,
      createOpenAIExtractor,
      telemetry: { sink: { record }, nowMs: () => 0 }
    } as never);

    const response = await handler(canonicalRequest(route, {}, "\u00a0"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "gpt_access_denied",
        message: "GPT access is denied.",
        requestId: `req-whitespace-${route}`,
        retryable: false
      }
    });
    expect(consume).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledWith({
      key: "synthetic-client",
      scope: "failed_access",
      limit: 10,
      windowMs: 60_000
    });
    expect(check).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
    expect(createOpenAIExtractor).not.toHaveBeenCalled();
    expect(processRequest).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "GPT correction-only",
      body: {
        message: "",
        correction: { set: { finalArrivalDelayMinutes: 240 }, clear: [] },
        requestedMode: "gpt",
        privacyAcknowledged: undefined
      },
      extraction: {
        performed: false,
        requestedMode: "gpt",
        provider: null,
        model: null,
        notRunReason: "correction_only"
      },
      localCalls: 0
    },
    {
      label: "GPT preflight-blocked",
      body: {
        message: "There is an active fire and I need emergency help",
        requestedMode: "gpt",
        privacyAcknowledged: undefined
      },
      extraction: {
        performed: false,
        requestedMode: "gpt",
        provider: null,
        model: null,
        notRunReason: "preflight_guard"
      },
      localCalls: 0
    },
    {
      label: "default Local",
      body: { requestedMode: undefined, privacyAcknowledged: undefined },
      extraction: {
        performed: true,
        requestedMode: "local",
        provider: "local",
        model: null
      },
      localCalls: 1
    },
    {
      label: "explicit Local",
      body: { requestedMode: "local", privacyAcknowledged: undefined },
      extraction: {
        performed: true,
        requestedMode: "local",
        provider: "local",
        model: null
      },
      localCalls: 1
    }
  ] as const)(
    "keeps $label outside every GPT control",
    async ({ body, extraction, localCalls }) => {
      const guard = vi.fn<typeof guardGptRequest>().mockResolvedValue({
        allowed: true,
        lease: { release: vi.fn().mockResolvedValue(undefined) }
      });
      const controls = freshControlSpies({ guard });
      const localExtract = vi.fn().mockResolvedValue({ set: {} });
      const createOpenAIExtractor = vi.fn(() => openaiExtractor());
      const fetcher = vi.spyOn(globalThis, "fetch");
      const handler = createHandler({
        demoAccessCode: DEMO_CODE,
        gptControls: controls.controls,
        localExtractor: localExtractor(localExtract),
        createOpenAIExtractor,
        knowledgeRepository: { load: async () => knowledgeSnapshotFixture() },
        now: () => "2026-07-20"
      } as never);

      const response = await handler(canonicalRequest(route, body));
      const responseBody = await response.json();

      expect(response.status).toBe(200);
      expect(responseBody.result.extraction).toEqual(extraction);
      expect(localExtract).toHaveBeenCalledTimes(localCalls);
      expect(controls.resolve).not.toHaveBeenCalled();
      expect(guard).not.toHaveBeenCalled();
      expect(controls.consume).not.toHaveBeenCalled();
      expect(controls.acquire).not.toHaveBeenCalled();
      expect(controls.check).not.toHaveBeenCalled();
      expect(createOpenAIExtractor).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it("rejects missing privacy consent before identity, guard, workflow, or telemetry", async () => {
    const guard = vi.fn<typeof guardGptRequest>().mockResolvedValue({
      allowed: true,
      lease: { release: vi.fn().mockResolvedValue(undefined) }
    });
    const controls = freshControlSpies({ guard });
    const processRequest = vi.fn().mockResolvedValue(canonicalGptResponse());
    const localExtract = vi.fn().mockResolvedValue({ set: {} });
    const createOpenAIExtractor = vi.fn(() => openaiExtractor());
    const clock = vi.fn(() => "2026-07-20");
    const record = vi.fn<(event: SafeTelemetryEvent) => void>();
    const requestId = `req-no-consent-${route}`;
    const handler = createHandler({
      requestIdFactory: () => requestId,
      demoAccessCode: DEMO_CODE,
      gptControls: controls.controls,
      processRequest,
      localExtractor: localExtractor(localExtract),
      createOpenAIExtractor,
      now: clock,
      telemetry: { sink: { record }, nowMs: () => 0 }
    } as never);

    const response = await handler(
      canonicalRequest(route, { privacyAcknowledged: false }, DEMO_CODE)
    );

    await expectExactError(response, "gpt_access_denied", requestId);
    expect(controls.resolve).not.toHaveBeenCalled();
    expect(guard).not.toHaveBeenCalled();
    expect(controls.consume).not.toHaveBeenCalled();
    expect(controls.check).not.toHaveBeenCalled();
    expect(controls.acquire).not.toHaveBeenCalled();
    expect(localExtract).not.toHaveBeenCalled();
    expect(createOpenAIExtractor).not.toHaveBeenCalled();
    expect(processRequest).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["invalid", "wrong-synthetic-code"]
  ] as const)(
    "routes a %s demo code only through the failed-access bucket",
    async (label, suppliedCode) => {
      const controls = freshControlSpies();
      const processRequest = vi.fn().mockResolvedValue(canonicalGptResponse());
      const localExtract = vi.fn().mockResolvedValue({ set: {} });
      const createOpenAIExtractor = vi.fn(() => openaiExtractor());
      const clock = vi.fn(() => "2026-07-20");
      const record = vi.fn<(event: SafeTelemetryEvent) => void>();
      const requestId = `req-${label}-code-${route}`;
      const handler = createHandler({
        requestIdFactory: () => requestId,
        demoAccessCode: DEMO_CODE,
        gptControls: controls.controls,
        processRequest,
        localExtractor: localExtractor(localExtract),
        createOpenAIExtractor,
        now: clock,
        telemetry: { sink: { record }, nowMs: () => 0 }
      } as never);

      const response = await handler(canonicalRequest(route, {}, suppliedCode));

      await expectExactError(response, "gpt_access_denied", requestId);
      expect(controls.resolve).toHaveBeenCalledOnce();
      expect(controls.consume).toHaveBeenCalledOnce();
      expect(controls.consume).toHaveBeenCalledWith({
        key: "synthetic-client",
        scope: "failed_access",
        limit: 10,
        windowMs: 60_000
      });
      expect(controls.check).not.toHaveBeenCalled();
      expect(controls.acquire).not.toHaveBeenCalled();
      expect(localExtract).not.toHaveBeenCalled();
      expect(createOpenAIExtractor).not.toHaveBeenCalled();
      expect(processRequest).not.toHaveBeenCalled();
      expect(clock).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["gpt_access_denied", "gpt_access_denied"],
    ["rate_limited", "rate_limited"],
    ["concurrency_limited", "concurrency_limited"],
    ["budget_restricted", "budget_restricted"],
    ["throw", "budget_restricted"]
  ] as const)(
    "fails closed when a custom guard returns or throws %s",
    async (guardOutcome, expectedCode) => {
      const guard = vi.fn<typeof guardGptRequest>(async () => {
        if (guardOutcome === "throw") throw new Error("private synthetic guard failure");
        return { allowed: false, code: guardOutcome } satisfies GptGuardResult;
      });
      const controls = freshControlSpies({ guard });
      const processRequest = vi.fn().mockResolvedValue(canonicalGptResponse());
      const localExtract = vi.fn().mockResolvedValue({ set: {} });
      const createOpenAIExtractor = vi.fn(() => openaiExtractor());
      const clock = vi.fn(() => "2026-07-20");
      const record = vi.fn<(event: SafeTelemetryEvent) => void>();
      const requestId = `req-guard-${guardOutcome}-${route}`;
      const handler = createHandler({
        requestIdFactory: () => requestId,
        demoAccessCode: DEMO_CODE,
        gptControls: controls.controls,
        processRequest,
        localExtractor: localExtractor(localExtract),
        createOpenAIExtractor,
        now: clock,
        telemetry: { sink: { record }, nowMs: () => 0 }
      } as never);

      const response = await handler(canonicalRequest(route));

      await expectExactError(response, expectedCode, requestId);
      expect(controls.resolve).toHaveBeenCalledOnce();
      expect(guard).toHaveBeenCalledOnce();
      expect(controls.consume).not.toHaveBeenCalled();
      expect(controls.check).not.toHaveBeenCalled();
      expect(controls.acquire).not.toHaveBeenCalled();
      expect(localExtract).not.toHaveBeenCalled();
      expect(createOpenAIExtractor).not.toHaveBeenCalled();
      expect(processRequest).not.toHaveBeenCalled();
      expect(clock).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    }
  );

  it.each([
    "success",
    "no-key Local fallback",
    "ModelFailure refusal",
    "ordinary throw",
    "OpenAI factory throw",
    "invalid final response"
  ] as const)("releases its GPT lease exactly once after %s", async (scenario) => {
    const release = vi.fn<ConcurrencyLease["release"]>().mockResolvedValue();
    const guard = vi.fn<typeof guardGptRequest>().mockResolvedValue({
      allowed: true,
      lease: { release }
    });
    const controls = freshControlSpies({ guard, release });
    const localExtract = vi.fn().mockResolvedValue({ set: {} });
    const processRequest = vi.fn();
    const createOpenAIExtractor = vi.fn<() => RawFactExtractor | undefined>();
    const scenarioOverrides: Record<string, unknown> = {};

    if (scenario === "no-key Local fallback") {
      createOpenAIExtractor.mockReturnValue(undefined);
    } else if (scenario === "OpenAI factory throw") {
      createOpenAIExtractor.mockImplementation(() => {
        throw new Error("private synthetic factory failure");
      });
      processRequest.mockResolvedValue(canonicalGptResponse(openaiExtraction));
      scenarioOverrides.processRequest = processRequest;
    } else {
      scenarioOverrides.openaiExtractor = openaiExtractor();
      scenarioOverrides.processRequest = processRequest;
      if (scenario === "success") {
        processRequest.mockResolvedValue(canonicalGptResponse(openaiExtraction));
      } else if (scenario === "ModelFailure refusal") {
        processRequest.mockRejectedValue(new ModelFailure("model_refusal", false, false));
      } else if (scenario === "ordinary throw") {
        processRequest.mockRejectedValue(new Error("private synthetic processor failure"));
      } else {
        processRequest.mockResolvedValue({ invalid: "synthetic-response" });
      }
    }

    const requestId = `req-lease-${scenario.replaceAll(" ", "-")}-${route}`;
    const handler = createHandler({
      requestIdFactory: () => requestId,
      demoAccessCode: DEMO_CODE,
      gptControls: controls.controls,
      localExtractor: localExtractor(localExtract),
      createOpenAIExtractor,
      knowledgeRepository: { load: async () => knowledgeSnapshotFixture() },
      now: () => "2026-07-20",
      ...scenarioOverrides
    } as never);

    const response = await handler(canonicalRequest(route));

    if (scenario === "success" || scenario === "no-key Local fallback") {
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.result.extraction).toEqual(
        scenario === "success" ? openaiExtraction : localFallbackExtraction
      );
    } else if (scenario === "ModelFailure refusal") {
      await expectExactError(response, "model_refusal", requestId);
    } else {
      await expectExactError(response, "upstream_failure", requestId);
    }

    expect(guard).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    if (scenario === "no-key Local fallback") {
      expect(localExtract).toHaveBeenCalledOnce();
      expect(processRequest).not.toHaveBeenCalled();
      expect(createOpenAIExtractor).toHaveBeenCalledOnce();
    } else if (scenario === "OpenAI factory throw") {
      expect(processRequest).not.toHaveBeenCalled();
      expect(createOpenAIExtractor).toHaveBeenCalledOnce();
    } else {
      expect(processRequest).toHaveBeenCalledOnce();
      expect(createOpenAIExtractor).not.toHaveBeenCalled();
    }
  });

  it("preserves the selected safe response when lease release rejects", async () => {
    const release = vi
      .fn<ConcurrencyLease["release"]>()
      .mockRejectedValue(new Error("private synthetic release failure"));
    const guard = vi.fn<typeof guardGptRequest>().mockResolvedValue({
      allowed: true,
      lease: { release }
    });
    const controls = freshControlSpies({ guard, release });
    const processRequest = vi.fn().mockResolvedValue(canonicalGptResponse(openaiExtraction));
    const handler = createHandler({
      demoAccessCode: DEMO_CODE,
      gptControls: controls.controls,
      openaiExtractor: openaiExtractor(),
      processRequest
    } as never);

    const response = await handler(canonicalRequest(route));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.extraction).toEqual(openaiExtraction);
    expect(processRequest).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });
});

describe("shared analyze and intake controls", () => {
  it("shares one ten-per-minute quota across both routes and ignores spoofed XFF values", async () => {
    const sharedControls = {
      identityResolver: createLocalTrustedIdentityResolver("shared-synthetic-client"),
      rateLimiter: new MemoryRateLimiter(() => 1_000),
      concurrencyLimiter: new MemoryConcurrencyLimiter(),
      budget: { check: async () => ({ allowed: true }) }
    };
    const processRequest = vi.fn().mockResolvedValue(canonicalGptResponse(openaiExtraction));
    const common = {
      demoAccessCode: DEMO_CODE,
      gptControls: sharedControls,
      openaiExtractor: openaiExtractor(),
      processRequest
    };
    const analyze = createAnalyzeRouteHandler({
      ...common,
      requestIdFactory: () => "req-shared-analyze"
    } as never);
    const intake = createIntakeRouteHandler({
      ...common,
      requestIdFactory: () => "req-shared-intake"
    } as never);
    const handlers = { analyze, intake };
    const responses = await Array.from({ length: 10 }, (_value, index) => index).reduce<
      Promise<Response[]>
    >(async (pending, index) => {
      const collected = await pending;
      const route = index % 2 === 0 ? "analyze" : "intake";
      const response = await handlers[route](
        canonicalRequest(route, {}, DEMO_CODE, `198.51.100.${index + 1}`)
      );
      return [...collected, response];
    }, Promise.resolve([]));

    expect(responses.map(({ status }) => status)).toEqual(Array.from({ length: 10 }, () => 200));
    expect(processRequest).toHaveBeenCalledTimes(10);

    const eleventh = await analyze(canonicalRequest("analyze", {}, DEMO_CODE, "203.0.113.250"));
    await expectExactError(eleventh, "rate_limited", "req-shared-analyze");
    expect(processRequest).toHaveBeenCalledTimes(10);
  });

  it("holds two leases across both routes, rejects the third, and releases both without hanging", async () => {
    const sharedControls = {
      identityResolver: createLocalTrustedIdentityResolver("concurrent-synthetic-client"),
      rateLimiter: new MemoryRateLimiter(() => 2_000),
      concurrencyLimiter: new MemoryConcurrencyLimiter(),
      budget: { check: async () => ({ allowed: true }) }
    };
    const firstGate = deferred<ReturnType<typeof canonicalGptResponse>>();
    const secondGate = deferred<ReturnType<typeof canonicalGptResponse>>();
    const processRequest = vi
      .fn()
      .mockImplementationOnce(() => firstGate.promise)
      .mockImplementationOnce(() => secondGate.promise)
      .mockResolvedValue(canonicalGptResponse(openaiExtraction));
    const common = {
      demoAccessCode: DEMO_CODE,
      gptControls: sharedControls,
      openaiExtractor: openaiExtractor(),
      processRequest
    };
    const analyze = createAnalyzeRouteHandler({
      ...common,
      requestIdFactory: () => "req-concurrency-analyze"
    } as never);
    const intake = createIntakeRouteHandler({
      ...common,
      requestIdFactory: () => "req-concurrency-intake"
    } as never);
    const first = analyze(canonicalRequest("analyze"));
    await vi.waitFor(() => expect(processRequest).toHaveBeenCalledTimes(1));
    const second = intake(canonicalRequest("intake"));
    await vi.waitFor(() => expect(processRequest).toHaveBeenCalledTimes(2));

    const third = await analyze(canonicalRequest("analyze"));
    await expectExactError(third, "concurrency_limited", "req-concurrency-analyze");
    expect(processRequest).toHaveBeenCalledTimes(2);

    firstGate.resolve(canonicalGptResponse(openaiExtraction));
    secondGate.resolve(canonicalGptResponse(openaiExtraction));
    const completed = await Promise.all([first, second]);
    expect(completed.map(({ status }) => status)).toEqual([200, 200]);

    const afterRelease = await intake(canonicalRequest("intake"));
    expect(afterRelease.status).toBe(200);
    expect(processRequest).toHaveBeenCalledTimes(3);
  });
});

describe("local identity and judge gate", () => {
  it("uses one opaque local-test identity regardless of XFF", () => {
    const resolver = createLocalTrustedIdentityResolver("opaque-synthetic-key");
    const first = resolver.resolve(canonicalRequest("analyze", {}, DEMO_CODE, "198.51.100.10"));
    const second = resolver.resolve(canonicalRequest("analyze", {}, DEMO_CODE, "203.0.113.20"));

    expect(first).toEqual({
      key: "opaque-synthetic-key",
      source: "local_test",
      globallyEnforceable: false
    });
    expect(second).toEqual(first);
  });

  it.each(routeFactories)(
    "allows a valid judge-gated request through the non-global local %s controls",
    async (route, createHandler) => {
      const resolver = createLocalTrustedIdentityResolver("judge-synthetic-key");
      const createOpenAIExtractor = vi.fn(() => undefined);
      const localExtract = vi.fn().mockResolvedValue({ set: {} });
      const fetcher = vi.spyOn(globalThis, "fetch");
      const handler = createHandler({
        demoAccessCode: DEMO_CODE,
        gptControls: {
          identityResolver: resolver,
          rateLimiter: new MemoryRateLimiter(() => 3_000),
          concurrencyLimiter: new MemoryConcurrencyLimiter(),
          budget: { check: async () => ({ allowed: true }) }
        },
        createOpenAIExtractor,
        localExtractor: localExtractor(localExtract),
        knowledgeRepository: { load: async () => knowledgeSnapshotFixture() },
        now: () => "2026-07-20"
      } as never);

      const response = await handler(canonicalRequest(route, {}, DEMO_CODE, "198.51.100.200"));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.result.extraction).toEqual(localFallbackExtraction);
      expect(createOpenAIExtractor).toHaveBeenCalledOnce();
      expect(localExtract).toHaveBeenCalledOnce();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
});

describe("default public GPT composition", () => {
  it("shares the module-scoped minute quota between analyze and intake", async () => {
    const processRequest = vi.fn().mockResolvedValue(canonicalGptResponse(openaiExtraction));
    const common = {
      demoAccessCode: DEMO_CODE,
      openaiExtractor: openaiExtractor(),
      processRequest
    };
    const analyze = createAnalyzeRouteHandler({
      ...common,
      requestIdFactory: () => "req-default-shared-analyze"
    });
    const intake = createIntakeRouteHandler({
      ...common,
      requestIdFactory: () => "req-default-shared-intake"
    });
    const handlers = { analyze, intake };

    const statuses: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const route = index % 2 === 0 ? "analyze" : "intake";
      // eslint-disable-next-line no-await-in-loop -- requests must fill one shared window in order.
      const response = await handlers[route](canonicalRequest(route));
      statuses.push(response.status);
    }

    expect(statuses).toEqual(Array.from({ length: 10 }, () => 200));
    expect(processRequest).toHaveBeenCalledTimes(10);

    const eleventh = await analyze(canonicalRequest("analyze"));
    await expectExactError(eleventh, "rate_limited", "req-default-shared-analyze");
    expect(processRequest).toHaveBeenCalledTimes(10);
  });
});
