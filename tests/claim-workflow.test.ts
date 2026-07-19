import { describe, expect, it, vi } from "vitest";

import type { AnalyzeClaimResponse } from "../lib/api/analyze-contract";
import { RAW_FACT_PATHS, type UserFactEdit } from "../lib/domain/claim-contract";
import {
  analyzeClaim,
  parseAnalysisApiError,
  parseAnalyzeClaimResponse
} from "../src/lib/analysis-api-client";
import {
  FACT_FIELD_DEFINITIONS,
  claimWorkflowReducer,
  createInitialClaimWorkflowState,
  editFromForm,
  isLegalResponseRevision
} from "../src/lib/claim-workflow";
import { analyzeResponseFixture, localRequest } from "./fixtures/analyze-transport";
import { claimState, type DeepPartial } from "./fixtures/raw-claims";

function responseAt(
  baseRevision: number,
  responseRevision: number,
  overrides: DeepPartial<AnalyzeClaimResponse> = {}
): AnalyzeClaimResponse {
  return analyzeResponseFixture({
    baseRevision,
    claimState: { revision: responseRevision },
    result: { factsRevision: responseRevision },
    ...overrides
  });
}

describe("claim workflow reducer", () => {
  it("ignores a late response from an older token and revision", () => {
    const current = createInitialClaimWorkflowState(claimState({}, 4));
    const newer = claimWorkflowReducer(current, {
      type: "request_started",
      token: 2,
      baseRevision: 4,
      kind: "correction"
    });
    const stale = claimWorkflowReducer(newer, {
      type: "response_received",
      token: 1,
      response: responseAt(3, 4)
    });

    expect(stale).toBe(newer);
  });

  it("rejects a matching token with the wrong echoed base revision", () => {
    const started = claimWorkflowReducer(createInitialClaimWorkflowState(claimState({}, 4)), {
      type: "request_started",
      token: 7,
      baseRevision: 4,
      kind: "message"
    });

    expect(
      claimWorkflowReducer(started, {
        type: "response_received",
        token: 7,
        response: responseAt(3, 4)
      })
    ).toBe(started);
  });

  it("rejects a matching revision with the wrong token", () => {
    const started = claimWorkflowReducer(createInitialClaimWorkflowState(claimState({}, 4)), {
      type: "request_started",
      token: 7,
      baseRevision: 4,
      kind: "message"
    });

    expect(
      claimWorkflowReducer(started, {
        type: "response_received",
        token: 8,
        response: responseAt(4, 5)
      })
    ).toBe(started);
  });

  it("rejects claim and result revision mismatches", () => {
    const started = claimWorkflowReducer(createInitialClaimWorkflowState(claimState({}, 4)), {
      type: "request_started",
      token: 1,
      baseRevision: 4,
      kind: "message"
    });
    const mismatch = responseAt(4, 5, { result: { factsRevision: 4 } });

    expect(
      claimWorkflowReducer(started, {
        type: "response_received",
        token: 1,
        response: mismatch
      })
    ).toBe(started);
  });

  it.each([0, 99])("rejects same-token correction response revision %s", (revision) => {
    const started = claimWorkflowReducer(createInitialClaimWorkflowState(claimState({}, 4)), {
      type: "request_started",
      token: 1,
      baseRevision: 4,
      kind: "correction"
    });

    expect(
      claimWorkflowReducer(started, {
        type: "response_received",
        token: 1,
        response: responseAt(4, revision)
      })
    ).toBe(started);
  });

  it("accepts only legal message and correction revision transitions", () => {
    expect(isLegalResponseRevision({ token: 1, baseRevision: 4, kind: "message" }, 4)).toBe(true);
    expect(isLegalResponseRevision({ token: 1, baseRevision: 4, kind: "message" }, 5)).toBe(true);
    expect(isLegalResponseRevision({ token: 1, baseRevision: 4, kind: "message" }, 6)).toBe(false);
    expect(isLegalResponseRevision({ token: 1, baseRevision: 4, kind: "correction" }, 5)).toBe(
      true
    );
    expect(isLegalResponseRevision({ token: 1, baseRevision: 4, kind: "correction" }, 4)).toBe(
      false
    );
  });

  it("ignores a response after reset", () => {
    const started = claimWorkflowReducer(createInitialClaimWorkflowState(claimState({}, 4)), {
      type: "request_started",
      token: 3,
      baseRevision: 4,
      kind: "message"
    });
    const reset = claimWorkflowReducer(started, { type: "reset" });

    expect(
      claimWorkflowReducer(reset, {
        type: "response_received",
        token: 3,
        response: responseAt(4, 5)
      })
    ).toBe(reset);
  });

  it("ignores a response after a mode-change cancellation", () => {
    const started = claimWorkflowReducer(createInitialClaimWorkflowState(claimState({}, 4)), {
      type: "request_started",
      token: 3,
      baseRevision: 4,
      kind: "message"
    });
    const cancelled = claimWorkflowReducer(started, { type: "request_cancelled", token: 3 });

    expect(cancelled.activeRequest).toBeNull();
    expect(
      claimWorkflowReducer(cancelled, {
        type: "response_received",
        token: 3,
        response: responseAt(4, 5)
      })
    ).toBe(cancelled);
  });

  it("enters and cancels fact review without replacing the current result", () => {
    const started = claimWorkflowReducer(createInitialClaimWorkflowState(), {
      type: "request_started",
      token: 1,
      baseRevision: 0,
      kind: "message"
    });
    const ready = claimWorkflowReducer(started, {
      type: "response_received",
      token: 1,
      response: responseAt(0, 1)
    });
    const reviewing = claimWorkflowReducer(ready, { type: "review_started" });
    const cancelled = claimWorkflowReducer(reviewing, { type: "review_cancelled" });

    expect(reviewing.phase).toBe("reviewing_facts");
    expect(reviewing.result).toBe(ready.result);
    expect(cancelled.phase).toBe("needs_information");
    expect(cancelled.result).toBe(ready.result);
  });

  it("treats abort cancellation as non-visible state", () => {
    const started = claimWorkflowReducer(createInitialClaimWorkflowState(), {
      type: "request_started",
      token: 1,
      baseRevision: 0,
      kind: "message"
    });
    const cancelled = claimWorkflowReducer(started, { type: "request_cancelled", token: 1 });

    expect(cancelled).toMatchObject({ phase: "idle", activeRequest: null, error: null });
  });
});

describe("analysis API client", () => {
  it("accepts legal message revisions and the exact correction increment", () => {
    expect(
      parseAnalyzeClaimResponse(responseAt(4, 4), {
        baseRevision: 4,
        requestKind: "message"
      }).claimState.revision
    ).toBe(4);
    expect(
      parseAnalyzeClaimResponse(responseAt(4, 5), {
        baseRevision: 4,
        requestKind: "message"
      }).claimState.revision
    ).toBe(5);
    expect(
      parseAnalyzeClaimResponse(responseAt(4, 5), {
        baseRevision: 4,
        requestKind: "correction"
      }).claimState.revision
    ).toBe(5);
  });

  it.each([0, 4, 99])("rejects illegal correction response revision %s", (revision) => {
    expect(() =>
      parseAnalyzeClaimResponse(responseAt(4, revision), {
        baseRevision: 4,
        requestKind: "correction"
      })
    ).toThrowError("invalid_analysis_response");
  });

  it("rejects unknown response keys and inconsistent fact revisions", () => {
    expect(() =>
      parseAnalyzeClaimResponse(
        { ...responseAt(0, 1), internal: true },
        {
          baseRevision: 0,
          requestKind: "message"
        }
      )
    ).toThrowError("invalid_analysis_response");
    expect(() =>
      parseAnalyzeClaimResponse(responseAt(0, 1, { result: { factsRevision: 0 } }), {
        baseRevision: 0,
        requestKind: "message"
      })
    ).toThrowError("invalid_analysis_response");
  });

  it("returns only allowlisted safe API error data", () => {
    expect(
      parseAnalysisApiError(429, {
        error: {
          code: "rate_limited",
          message: "Too many requests. Please try again later.",
          requestId: "req-safe-1",
          retryable: true
        }
      })
    ).toEqual({
      status: 429,
      code: "rate_limited",
      message: "Too many requests. Please try again later.",
      requestId: "req-safe-1",
      retryable: true
    });
    expect(
      parseAnalysisApiError(502, {
        error: {
          code: "upstream_failure",
          message: "private stack and upstream body",
          requestId: "req-unsafe",
          retryable: true,
          stack: "secret"
        }
      })
    ).toEqual({
      status: 502,
      code: "analysis_failed",
      message: "Analysis could not be completed. Please try again.",
      requestId: null,
      retryable: true
    });
  });

  it("sends correction-only requests with an empty message", async () => {
    const prior = claimState({ deniedBoardingKind: "voluntary" }, 0);
    const correction: UserFactEdit = {
      set: { deniedBoardingKind: "involuntary" },
      clear: []
    };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        message: "",
        prior,
        correction,
        baseRevision: 0,
        requestedMode: "local",
        privacyAcknowledged: false
      });
      return Response.json(responseAt(0, 1));
    });

    await analyzeClaim(
      {
        message: "",
        prior,
        correction,
        baseRevision: 0,
        requestedMode: "local",
        privacyAcknowledged: false
      },
      { signal: new AbortController().signal, demoAccessCode: "", fetcher }
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not send a demo code for a local request", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).has("x-demo-access-code")).toBe(false);
      return Response.json(responseAt(0, 1));
    });

    await analyzeClaim(localRequest(), {
      signal: new AbortController().signal,
      demoAccessCode: "must-not-leak",
      fetcher
    });
  });
});

describe("fact editor contract", () => {
  it("defines every raw fact path exactly once", () => {
    const definitionPaths = FACT_FIELD_DEFINITIONS.map(({ path }) => path);
    expect(new Set(definitionPaths).size).toBe(definitionPaths.length);
    expect(definitionPaths.toSorted()).toEqual([...RAW_FACT_PATHS].toSorted());
  });

  it("distinguishes empty text from explicit clear", () => {
    expect(editFromForm({ deniedBoardingKind: "" }, [])).toEqual({ set: {}, clear: [] });
    expect(editFromForm({}, ["deniedBoardingKind"])).toEqual({
      set: {},
      clear: ["deniedBoardingKind"]
    });
  });

  it("trims strings, preserves zero and false, and deduplicates lists and clears", () => {
    expect(
      editFromForm(
        {
          provider: "  United  ",
          finalArrivalDelayMinutes: 0,
          isOvernight: false,
          evidence: [" receipt ", "receipt", "email"]
        },
        ["operatingCarrier", "operatingCarrier"]
      )
    ).toEqual({
      set: {
        provider: "United",
        finalArrivalDelayMinutes: 0,
        isOvernight: false,
        evidence: ["receipt", "email"]
      },
      clear: ["operatingCarrier"]
    });
  });

  it("rejects unknown paths, invalid enums, and negative integers", () => {
    expect(() => editFromForm({ secret: "value" } as never, [])).toThrowError("invalid_fact_edit");
    expect(() => editFromForm({ deniedBoardingKind: "forced" }, [])).toThrowError(
      "invalid_fact_edit"
    );
    expect(() => editFromForm({ finalArrivalDelayMinutes: -1 }, [])).toThrowError(
      "invalid_fact_edit"
    );
  });
});
