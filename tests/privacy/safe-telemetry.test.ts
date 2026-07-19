import { describe, expect, it, vi } from "vitest";

import { processClaimTurn, type ProcessClaimDependencies } from "../../lib/claim-workflow";
import type { RawFactExtractor } from "../../lib/model/raw-fact-extractor";
import {
  createSafeTelemetryEvent,
  type SafeTelemetryEvent,
  type TelemetrySink
} from "../../lib/privacy/safe-telemetry";
import { knowledgeSnapshotFixture } from "../fixtures/knowledge";
import { claimState } from "../fixtures/raw-claims";

const completePrior = () =>
  claimState({
    incidentType: "airline_cancellation",
    providerType: "airline",
    provider: "Synthetic Airways",
    operatingCarrier: "United",
    origin: { city: "New York", airport: "JFK", country: "United States" },
    destination: { city: "Los Angeles", airport: "LAX", country: "United States" },
    statedReason: "Synthetic private fact marker",
    reasonCategory: "crew",
    userInitiatedChange: false,
    isOvernight: true,
    assistance: { refundAccepted: false, reroutingAccepted: false },
    expenses: ["Synthetic private expense marker"],
    evidence: ["Synthetic private evidence marker"],
    userGoal: "Synthetic private goal marker"
  });

function extractor(
  provider: "local" | "openai",
  implementation: RawFactExtractor["extract"] = vi.fn().mockResolvedValue({ set: {} })
): RawFactExtractor {
  return {
    provider,
    model: provider === "openai" ? "gpt-5.6-luna" : null,
    extract: implementation
  } as RawFactExtractor;
}

function workflowDependencies(input: {
  record: ReturnType<typeof vi.fn>;
  times?: number[];
  localExtractor?: RawFactExtractor;
  openaiExtractor?: RawFactExtractor;
  knowledgeLoad?: ProcessClaimDependencies["knowledgeRepository"]["load"];
}): ProcessClaimDependencies {
  const times = input.times ?? [100, 125];
  const nowMs = vi.fn();
  times.forEach((time) => nowMs.mockReturnValueOnce(time));
  return {
    localExtractor: input.localExtractor ?? extractor("local"),
    ...(input.openaiExtractor ? { openaiExtractor: input.openaiExtractor } : {}),
    knowledgeRepository: {
      load: input.knowledgeLoad ?? (async () => knowledgeSnapshotFixture())
    },
    now: () => "2026-07-19",
    telemetry: {
      sink: { record: input.record as TelemetrySink["record"] },
      requestId: "req-synthetic-001",
      nowMs
    }
  };
}

export function compileTimeClosedTelemetryFixtures() {
  createSafeTelemetryEvent({
    requestId: "req-compile-1",
    category: "success",
    durationMs: 0,
    extractionPerformed: false,
    requestedMode: "local",
    // @ts-expect-error A not-run arm cannot invent a provider.
    provider: "local",
    model: null,
    notRunReason: "preflight_guard"
  });

  createSafeTelemetryEvent({
    requestId: "req-compile-2",
    category: "success",
    durationMs: 0,
    extractionPerformed: true,
    requestedMode: "local",
    provider: "local",
    model: null,
    // @ts-expect-error Private raw fields cannot cross the typed telemetry boundary.
    rawMessage: "synthetic private message"
  });
}

describe("createSafeTelemetryEvent", () => {
  it.each<SafeTelemetryEvent>([
    {
      requestId: "req-valid-not-run",
      category: "success",
      durationMs: 0,
      extractionPerformed: false,
      requestedMode: "gpt",
      provider: null,
      model: null,
      notRunReason: "preflight_guard"
    },
    {
      requestId: "req-valid-local",
      category: "success",
      durationMs: 12.5,
      inputTokens: 0,
      outputTokens: 42,
      workflowStatus: "ready",
      extractionPerformed: true,
      requestedMode: "local",
      provider: "local",
      model: null
    },
    {
      requestId: "req-valid-openai",
      category: "success",
      durationMs: 24,
      extractionPerformed: true,
      requestedMode: "gpt",
      provider: "openai",
      model: "gpt-5.6-luna"
    },
    {
      requestId: "req-valid-fallback",
      category: "fallback",
      durationMs: 8,
      extractionPerformed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "openai_extractor_unavailable"
    }
  ])("returns a fresh allowlisted event for a valid arm", (input) => {
    const event = createSafeTelemetryEvent(input);

    expect(event).toEqual(input);
    expect(event).not.toBe(input);
  });

  it.each([
    {
      requestId: " ",
      category: "success",
      durationMs: 0,
      extractionPerformed: true,
      requestedMode: "local",
      provider: "local",
      model: null
    },
    {
      requestId: "x".repeat(129),
      category: "success",
      durationMs: 0,
      extractionPerformed: true,
      requestedMode: "local",
      provider: "local",
      model: null
    },
    {
      requestId: "req-invalid-duration",
      category: "success",
      durationMs: Number.NaN,
      extractionPerformed: true,
      requestedMode: "local",
      provider: "local",
      model: null
    },
    {
      requestId: "req-invalid-token",
      category: "success",
      durationMs: 0,
      inputTokens: -1,
      extractionPerformed: true,
      requestedMode: "local",
      provider: "local",
      model: null
    },
    {
      requestId: "req-invalid-category",
      category: "private_error_detail",
      durationMs: 0,
      extractionPerformed: true,
      requestedMode: "local",
      provider: "local",
      model: null
    },
    {
      requestId: "req-mixed-not-run",
      category: "success",
      durationMs: 0,
      extractionPerformed: false,
      requestedMode: "gpt",
      provider: "openai",
      model: "gpt-5.6-luna",
      notRunReason: "preflight_guard"
    },
    {
      requestId: "req-not-run-fallback",
      category: "success",
      durationMs: 0,
      extractionPerformed: false,
      requestedMode: "gpt",
      provider: null,
      model: null,
      notRunReason: "preflight_guard",
      fallbackReason: "openai_extractor_unavailable"
    },
    {
      requestId: "req-not-run-model",
      category: "success",
      durationMs: 0,
      extractionPerformed: false,
      requestedMode: "gpt",
      provider: null,
      model: "gpt-5.6-luna",
      notRunReason: "preflight_guard"
    },
    {
      requestId: "req-local-fallback",
      category: "success",
      durationMs: 0,
      extractionPerformed: true,
      requestedMode: "local",
      provider: "local",
      model: null,
      fallbackReason: "openai_extractor_unavailable"
    },
    {
      requestId: "req-local-model",
      category: "success",
      durationMs: 0,
      extractionPerformed: true,
      requestedMode: "local",
      provider: "local",
      model: "gpt-5.6-luna"
    },
    {
      requestId: "req-openai-model",
      category: "upstream_failure",
      durationMs: 0,
      extractionPerformed: true,
      requestedMode: "gpt",
      provider: "openai",
      model: "wrong-model"
    },
    {
      requestId: "req-openai-not-run",
      category: "upstream_failure",
      durationMs: 0,
      extractionPerformed: true,
      requestedMode: "gpt",
      provider: "openai",
      model: "gpt-5.6-luna",
      notRunReason: "preflight_guard"
    },
    {
      requestId: "req-gpt-local-missing-fallback",
      category: "fallback",
      durationMs: 0,
      extractionPerformed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null
    },
    {
      requestId: "req-mixed-fallback",
      category: "fallback",
      durationMs: 0,
      extractionPerformed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "customer_account_12345"
    },
    {
      requestId: "req-private-raw",
      category: "success",
      durationMs: 0,
      extractionPerformed: true,
      requestedMode: "local",
      provider: "local",
      model: null,
      rawMessage: "synthetic private message"
    },
    {
      requestId: "req-private-error",
      category: "upstream_failure",
      durationMs: 0,
      extractionPerformed: true,
      requestedMode: "gpt",
      provider: "openai",
      model: "gpt-5.6-luna",
      error: { message: "synthetic private upstream detail" }
    }
  ])("rejects an invalid or non-allowlisted runtime event", (input) => {
    expect(() => createSafeTelemetryEvent(input as SafeTelemetryEvent)).toThrow(
      "invalid_safe_telemetry_event"
    );
  });
});

describe("processClaimTurn safe telemetry", () => {
  it.each([
    ["local", undefined, "local", null],
    ["gpt", extractor("openai"), "openai", "gpt-5.6-luna"]
  ] as const)(
    "records one completed %s provider arm without raw claim content",
    async (requestedMode, openaiExtractor, provider, model) => {
      const record = vi.fn();
      const message = "Synthetic private narrative marker";

      const response = await processClaimTurn(
        { message, prior: completePrior(), baseRevision: 0, requestedMode },
        workflowDependencies({ record, ...(openaiExtractor ? { openaiExtractor } : {}) })
      );

      expect(record).toHaveBeenCalledOnce();
      expect(record).toHaveBeenCalledWith({
        requestId: "req-synthetic-001",
        category: "success",
        durationMs: 25,
        workflowStatus: response.result.status,
        extractionPerformed: true,
        requestedMode,
        provider,
        model
      });
      const logged = JSON.stringify(record.mock.calls);
      expect(logged).not.toContain(message);
      expect(logged).not.toContain("Synthetic private fact marker");
      expect(logged).not.toContain("Synthetic private expense marker");
      expect(logged).not.toContain("Synthetic private evidence marker");
      expect(logged).not.toContain("Synthetic private goal marker");
    }
  );

  it("records the canonical fallback when the OpenAI extractor is unavailable", async () => {
    const record = vi.fn();
    const response = await processClaimTurn(
      {
        message: "Synthetic fallback narrative",
        prior: completePrior(),
        baseRevision: 0,
        requestedMode: "gpt"
      },
      workflowDependencies({ record })
    );

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith({
      requestId: "req-synthetic-001",
      category: "fallback",
      durationMs: 25,
      workflowStatus: response.result.status,
      extractionPerformed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "openai_extractor_unavailable"
    });
  });

  it.each([
    {
      label: "preflight",
      request: {
        message: "There is an active fire and I need emergency help",
        prior: completePrior(),
        baseRevision: 0,
        requestedMode: "gpt" as const
      },
      notRunReason: "preflight_guard"
    },
    {
      label: "correction",
      request: {
        message: "",
        prior: completePrior(),
        baseRevision: 0,
        requestedMode: "local" as const,
        correction: { set: { finalArrivalDelayMinutes: 240 }, clear: [] as [] }
      },
      notRunReason: "correction_only"
    }
  ] as const)("records a truthful $label not-run arm", async ({ request, notRunReason }) => {
    const record = vi.fn();
    const response = await processClaimTurn(request, workflowDependencies({ record }));

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith({
      requestId: "req-synthetic-001",
      category: "success",
      durationMs: 25,
      workflowStatus: response.result.status,
      extractionPerformed: false,
      requestedMode: request.requestedMode,
      provider: null,
      model: null,
      notRunReason
    });
  });

  it("records a fixed upstream failure after the OpenAI arm begins and rethrows", async () => {
    const record = vi.fn();
    const privateError = new Error("Synthetic private provider failure");
    const throwingOpenAI = extractor("openai", vi.fn().mockRejectedValue(privateError));

    await expect(
      processClaimTurn(
        {
          message: "Synthetic private exception narrative",
          prior: completePrior(),
          baseRevision: 0,
          requestedMode: "gpt"
        },
        workflowDependencies({ record, openaiExtractor: throwingOpenAI })
      )
    ).rejects.toBe(privateError);

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith({
      requestId: "req-synthetic-001",
      category: "upstream_failure",
      durationMs: 25,
      extractionPerformed: true,
      requestedMode: "gpt",
      provider: "openai",
      model: "gpt-5.6-luna"
    });
    expect(JSON.stringify(record.mock.calls)).not.toContain(privateError.message);
  });

  it("records one fixed upstream failure while a requested Local extraction rejects", async () => {
    const record = vi.fn();
    const privateError = new Error("Synthetic private Local failure");
    const throwingLocal = extractor("local", vi.fn().mockRejectedValue(privateError));

    await expect(
      processClaimTurn(
        {
          message: "Synthetic private Local exception narrative",
          prior: completePrior(),
          baseRevision: 0,
          requestedMode: "local"
        },
        workflowDependencies({ record, localExtractor: throwingLocal })
      )
    ).rejects.toBe(privateError);

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith({
      requestId: "req-synthetic-001",
      category: "upstream_failure",
      durationMs: 25,
      extractionPerformed: true,
      requestedMode: "local",
      provider: "local",
      model: null
    });
    expect(JSON.stringify(record.mock.calls)).not.toContain(privateError.message);
  });

  it("does not attribute a downstream repository rejection to a completed provider arm", async () => {
    const record = vi.fn();
    const downstreamError = new Error("Synthetic downstream repository failure");

    await expect(
      processClaimTurn(
        {
          message: "No additional synthetic facts.",
          prior: completePrior(),
          baseRevision: 0,
          requestedMode: "local"
        },
        workflowDependencies({
          record,
          knowledgeLoad: vi.fn().mockRejectedValue(downstreamError)
        })
      )
    ).rejects.toBe(downstreamError);

    expect(record).not.toHaveBeenCalled();
  });

  it("does not invent provider telemetry for correction-only downstream rejection", async () => {
    const record = vi.fn();
    const downstreamError = new Error("Synthetic correction repository failure");

    await expect(
      processClaimTurn(
        {
          message: "",
          prior: completePrior(),
          baseRevision: 0,
          requestedMode: "gpt",
          correction: { set: { finalArrivalDelayMinutes: 240 }, clear: [] }
        },
        workflowDependencies({
          record,
          knowledgeLoad: vi.fn().mockRejectedValue(downstreamError)
        })
      )
    ).rejects.toBe(downstreamError);

    expect(record).not.toHaveBeenCalled();
  });

  it("does not invent telemetry when GPT local prepass fails or input parsing rejects", async () => {
    const record = vi.fn();
    const privateError = new Error("Synthetic local prepass failure");
    const throwingLocal = extractor("local", vi.fn().mockRejectedValue(privateError));

    await expect(
      processClaimTurn(
        {
          message: "Synthetic private prepass narrative",
          prior: completePrior(),
          baseRevision: 0,
          requestedMode: "gpt"
        },
        workflowDependencies({ record, localExtractor: throwingLocal })
      )
    ).rejects.toBe(privateError);
    await expect(
      processClaimTurn(
        { message: "invalid without state" } as never,
        workflowDependencies({ record, localExtractor: throwingLocal })
      )
    ).rejects.toThrow("invalid_analyze_claim_request");

    expect(record).not.toHaveBeenCalled();
  });

  it("swallows a sink exception without changing output or attempting a second record", async () => {
    const baselineRecord = vi.fn();
    const failingRecord = vi.fn(() => {
      throw new Error("Synthetic sink failure");
    });
    const request = {
      message: "No additional synthetic facts.",
      prior: completePrior(),
      baseRevision: 0,
      requestedMode: "local" as const
    };

    const baseline = await processClaimTurn(
      request,
      workflowDependencies({ record: baselineRecord })
    );
    const result = await processClaimTurn(request, workflowDependencies({ record: failingRecord }));

    expect(result).toEqual(baseline);
    expect(failingRecord).toHaveBeenCalledOnce();
  });
});
