import { describe, expect, it, vi } from "vitest";

import { POST } from "../../app/api/analyze/route";
import { createAnalyzeRouteHandler } from "../../lib/api/analyze-route-handler";
import type { AnalyzeClaimDomainResponse } from "../../lib/domain/claim-contract";
import { presentationFixture } from "../fixtures/analysis-view-model";
import { claimState } from "../fixtures/raw-claims";

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://local/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );
}

function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, key));
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(record, key) ||
    Object.values(record).some((item) => containsKey(item, key))
  );
}

describe("canonical analyze response", () => {
  it("returns the public view model envelope with matching revisions and no internals", async () => {
    const prior = claimState({
      incidentType: "airline_cancellation",
      providerType: "airline",
      operatingCarrier: "United",
      origin: { airport: "JFK" },
      destination: { airport: "LAX" },
      reasonCategory: "crew",
      userInitiatedChange: false,
      assistance: { refundAccepted: false, reroutingAccepted: false }
    });
    const response = await post({
      message: "No additional facts.",
      prior,
      baseRevision: prior.revision,
      requestedMode: "local"
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["baseRevision", "claimState", "result"]);
    expect(body).toHaveProperty("claimState");
    expect(body).not.toHaveProperty("context");
    expect(body.baseRevision).toBe(prior.revision);
    expect(body.claimState.revision).toBe(body.result.factsRevision);
    expect(containsKey(body, "strength")).toBe(false);
    expect(containsKey(body, "score")).toBe(false);
  });

  it("reports correction-only extraction without calling fetch", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const prior = claimState(
      {
        incidentType: "denied_boarding",
        origin: { airport: "JFK" },
        deniedBoardingKind: "voluntary"
      },
      1
    );
    const response = await post({
      message: "",
      prior,
      baseRevision: 1,
      correction: { set: { deniedBoardingKind: "involuntary" }, clear: [] },
      requestedMode: "gpt"
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.extraction).toEqual({
      performed: false,
      requestedMode: "gpt",
      provider: null,
      model: null,
      notRunReason: "correction_only"
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [
      "echoed base revision",
      (response: AnalyzeClaimDomainResponse) => {
        response.baseRevision += 1;
      }
    ],
    [
      "facts revision",
      (response: AnalyzeClaimDomainResponse) => {
        response.result.factsRevision += 1;
      }
    ]
  ] as const)("fails closed on a processor response with the wrong %s", async (_label, mutate) => {
    const input = presentationFixture();
    const processorResponse = {
      baseRevision: 0,
      claimState: input.claimState,
      result: input.assessment,
      context: input.context
    } satisfies AnalyzeClaimDomainResponse;
    mutate(processorResponse);
    const handler = createAnalyzeRouteHandler({
      processRequest: vi.fn().mockResolvedValue(processorResponse),
      requestIdFactory: () => "req-invalid-revision"
    });
    const prior = claimState();
    const response = await handler(
      new Request("http://local/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "A bounded synthetic claim.",
          prior,
          baseRevision: prior.revision,
          requestedMode: "local"
        })
      })
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: {
        code: "upstream_failure",
        message: "The analysis service is temporarily unavailable.",
        requestId: "req-invalid-revision",
        retryable: true
      }
    });
  });

  it("fails closed when a blocked processor payload contains ordinary analysis data", async () => {
    const input = presentationFixture();
    const processorResponse = {
      baseRevision: 0,
      claimState: input.claimState,
      result: {
        ...input.assessment,
        status: "out_of_scope",
        primaryScenario: null,
        scenarioIds: [],
        missingFacts: [],
        legalRegimes: [],
        assessments: [],
        retrieval: {
          policyApplicability: [],
          displayedPolicies: [],
          displayedCases: [],
          displayedScripts: []
        },
        nextActions: []
      },
      context: null
    } satisfies AnalyzeClaimDomainResponse;
    const handler = createAnalyzeRouteHandler({
      processRequest: vi.fn().mockResolvedValue(processorResponse),
      requestIdFactory: () => "req-malicious-blocked"
    });
    const prior = claimState();
    const response = await handler(
      new Request("http://local/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "A bounded synthetic claim.",
          prior,
          baseRevision: prior.revision,
          requestedMode: "local"
        })
      })
    );

    expect(processorResponse.result.factsUsed).not.toEqual([]);
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("incidentType");
  });

  it("fails closed when a processor returns an unknown workflow status", async () => {
    const input = presentationFixture();
    const processorResponse = {
      baseRevision: 0,
      claimState: input.claimState,
      result: input.assessment,
      context: input.context
    } satisfies AnalyzeClaimDomainResponse;
    (processorResponse.result as { status: string }).status = "private_unknown_status";
    const handler = createAnalyzeRouteHandler({
      processRequest: vi.fn().mockResolvedValue(processorResponse),
      requestIdFactory: () => "req-unknown-status"
    });
    const prior = claimState();
    const response = await handler(
      new Request("http://local/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "A bounded synthetic claim.",
          prior,
          baseRevision: prior.revision,
          requestedMode: "local"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("upstream_failure");
    expect(JSON.stringify(body)).not.toContain("private_unknown_status");
  });
});
