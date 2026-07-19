import { describe, expect, it, vi } from "vitest";

import { createAnalyzeRouteHandler } from "../../lib/api/analyze-route-handler";
import { ApiFault } from "../../lib/api/api-error";
import { createIntakeRouteHandler } from "../../lib/api/intake-route-handler";
import {
  toApiErrorResponse,
  withRequestId,
  type ApiErrorCode,
  type ApiErrorEnvelope
} from "../../lib/api/api-response";
import { ModelFailure } from "../../lib/model/model-error";
import type { SafeTelemetryEvent } from "../../lib/privacy/safe-telemetry";
import { knowledgeSnapshotFixture } from "../fixtures/knowledge";
import { claimState } from "../fixtures/raw-claims";

const fixedMessages: Record<ApiErrorCode, string> = {
  invalid_json: "Invalid JSON request.",
  gpt_access_denied: "GPT access is denied.",
  request_too_large: "Request body is too large.",
  unsupported_media_type: "Request content type must be application/json.",
  unprocessable_request: "Request could not be processed.",
  rate_limited: "Too many requests. Please try again later.",
  concurrency_limited: "Too many requests are in progress. Please try again later.",
  budget_restricted: "GPT analysis is temporarily restricted.",
  model_refusal: "The model could not process this request.",
  model_timeout: "The analysis service timed out.",
  upstream_rate_limited: "The analysis service is temporarily unavailable.",
  upstream_unavailable: "The analysis service is temporarily unavailable.",
  invalid_model_json: "The analysis service returned an invalid response.",
  invalid_model_schema: "The analysis service returned an invalid response.",
  upstream_failure: "The analysis service is temporarily unavailable."
};

function expectExactEnvelope(
  body: unknown,
  expected: { code: ApiErrorCode; requestId?: string; retryable: boolean }
): asserts body is ApiErrorEnvelope {
  expect(body).toEqual({
    error: {
      code: expected.code,
      message: fixedMessages[expected.code],
      requestId: expected.requestId ?? "req-fixed-001",
      retryable: expected.retryable
    }
  });
  expect(Object.keys(body as Record<string, unknown>)).toEqual(["error"]);
  expect(Object.keys((body as ApiErrorEnvelope).error)).toEqual([
    "code",
    "message",
    "requestId",
    "retryable"
  ]);
}

export function compileTimeRouteTelemetryFixtures() {
  const telemetry = {
    sink: { record: (event: SafeTelemetryEvent) => Boolean(event) },
    nowMs: () => 0
  };
  createAnalyzeRouteHandler({ telemetry });
  createIntakeRouteHandler({ telemetry });
  createAnalyzeRouteHandler({
    telemetry: {
      ...telemetry,
      // @ts-expect-error Route telemetry receives its server request ID from the handler.
      requestId: "caller-supplied-request-id"
    }
  });
  createIntakeRouteHandler({
    telemetry: {
      ...telemetry,
      // @ts-expect-error Route telemetry receives its server request ID from the handler.
      requestId: "caller-supplied-request-id"
    }
  });
}

describe("unified API error serializer", () => {
  it.each([
    ["invalid_json", 400, false],
    ["gpt_access_denied", 401, false],
    ["request_too_large", 413, false],
    ["unsupported_media_type", 415, false],
    ["unprocessable_request", 422, false],
    ["model_refusal", 422, false],
    ["rate_limited", 429, true],
    ["concurrency_limited", 429, true],
    ["budget_restricted", 429, false],
    ["upstream_rate_limited", 502, true],
    ["upstream_unavailable", 502, true],
    ["invalid_model_json", 502, true],
    ["invalid_model_schema", 502, true],
    ["upstream_failure", 502, true],
    ["model_timeout", 504, true]
  ] as const)("maps %s to a fixed %i response", async (code, status, retryable) => {
    const response = toApiErrorResponse(code, "req-fixed-001");
    const body = await response.json();

    expect(response.status).toBe(status);
    expectExactEnvelope(body, { code, retryable });
  });

  it("maps known fault objects and unknown exceptions without leaking private fields", async () => {
    const privateMarker = "private-upstream-body-marker";
    const unknown = new Error(privateMarker, { cause: { body: privateMarker } });
    Object.assign(unknown, {
      details: privateMarker,
      content: privateMarker,
      response: { body: privateMarker }
    });

    const knownResponse = toApiErrorResponse(
      new ApiFault("unsupported_media_type", 415),
      "req-known"
    );
    const unknownResponse = toApiErrorResponse(unknown, "req-unknown");
    const knownBody = await knownResponse.json();
    const unknownBody = await unknownResponse.json();

    expect(knownResponse.status).toBe(415);
    expectExactEnvelope(knownBody, {
      code: "unsupported_media_type",
      requestId: "req-known",
      retryable: false
    });
    expect(unknownResponse.status).toBe(502);
    expectExactEnvelope(unknownBody, {
      code: "upstream_failure",
      requestId: "req-unknown",
      retryable: true
    });
    expect(JSON.stringify(unknownBody)).not.toContain(privateMarker);
    expect(unknownBody).not.toHaveProperty("stack");
  });

  it("generates one request ID through the injected factory", () => {
    const factory = vi.fn(() => "req-injected-001");

    const requestId = withRequestId(factory);

    expect(requestId).toBe("req-injected-001");
    expect(factory).toHaveBeenCalledOnce();
  });
});

describe("route error contract", () => {
  it.each([
    ["analyze", createAnalyzeRouteHandler],
    ["intake", createIntakeRouteHandler]
  ] as const)(
    "generates one server request ID for %s and ignores a client request-id header",
    async (route, createHandler) => {
      const requestIdFactory = vi.fn(() => "req-route-001");
      const handler = createHandler({ requestIdFactory } as never);
      const response = await handler(
        new Request(`http://localhost/api/${route}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "attacker-controlled-request-id"
          },
          body: "{not-json"
        })
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(requestIdFactory).toHaveBeenCalledOnce();
      expectExactEnvelope(body, {
        code: "invalid_json",
        requestId: "req-route-001",
        retryable: false
      });
      expect(JSON.stringify(body)).not.toContain("attacker-controlled-request-id");
    }
  );

  it.each([
    ["analyze", createAnalyzeRouteHandler],
    ["intake", createIntakeRouteHandler]
  ] as const)(
    "injects the same server request ID into one terminal %s telemetry event",
    async (route, createHandler) => {
      const record = vi.fn<(event: SafeTelemetryEvent) => void>();
      const nowMs = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125);
      const handler = createHandler({
        requestIdFactory: () => "req-route-telemetry-001",
        telemetry: { sink: { record }, nowMs },
        localExtractor: {
          provider: "local",
          model: null,
          extract: vi.fn().mockResolvedValue({ set: {} })
        },
        knowledgeRepository: { load: async () => knowledgeSnapshotFixture() },
        now: () => "2026-07-20"
      } as never);
      const response = await handler(
        new Request(`http://localhost/api/${route}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "attacker-controlled-request-id"
          },
          body: JSON.stringify({
            message: "A bounded claim message.",
            prior: claimState(),
            baseRevision: 0,
            requestedMode: "local"
          })
        })
      );

      expect(response.status).toBe(200);
      expect(record).toHaveBeenCalledOnce();
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-route-telemetry-001",
          category: "success",
          requestedMode: "local",
          provider: "local"
        })
      );
      expect(JSON.stringify(record.mock.calls)).not.toContain("attacker-controlled-request-id");
    }
  );

  it("preserves the outer intake request ID through the legacy adapter telemetry", async () => {
    const record = vi.fn<(event: SafeTelemetryEvent) => void>();
    const nowMs = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125);
    const handler = createIntakeRouteHandler({
      requestIdFactory: () => "req-legacy-telemetry-001",
      telemetry: { sink: { record }, nowMs },
      localExtractor: {
        provider: "local",
        model: null,
        extract: vi.fn().mockResolvedValue({ set: {} })
      }
    });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "A bounded legacy claim message.", facts: null })
      })
    );

    expect(response.status).toBe(200);
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-legacy-telemetry-001",
        category: "success",
        requestedMode: "local",
        provider: "local"
      })
    );
  });

  it.each([
    [new ModelFailure("model_refusal", false, false), 422, "model_refusal", false],
    [new ModelFailure("model_timeout", true, true), 504, "model_timeout", true],
    [new ModelFailure("invalid_model_schema", true, true), 502, "invalid_model_schema", true]
  ] as const)(
    "maps a terminal model failure without exposing its cause",
    async (failure, status, code, retryable) => {
      const privateMarker = "private-model-cause-marker";
      Object.assign(failure, { cause: new Error(privateMarker), content: privateMarker });
      const handler = createAnalyzeRouteHandler({
        requestIdFactory: () => "req-model-001",
        processRequest: vi.fn().mockRejectedValue(failure)
      });
      const response = await handler(
        new Request("http://localhost/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: "A bounded claim message.",
            prior: claimState(),
            baseRevision: 0
          })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(status);
      expectExactEnvelope(body, {
        code,
        requestId: "req-model-001",
        retryable
      });
      expect(JSON.stringify(body)).not.toContain(privateMarker);
    }
  );
});
