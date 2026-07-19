import { describe, expect, it } from "vitest";

import { POST as analyze } from "../../app/api/analyze/route";
import { POST as intake } from "../../app/api/intake/route";
import { GET as getScenarios } from "../../app/api/scenarios/route";
import { claimState } from "../fixtures/raw-claims";

function analyzeRequest(body: Record<string, unknown>) {
  return analyze(
    new Request("http://local/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );
}

function intakeRequest(body: Record<string, unknown>) {
  return intake(
    new Request("http://local/api/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );
}

async function expectUnprocessable(response: Response) {
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      code: "unprocessable_request",
      message: "Request could not be processed.",
      requestId: expect.any(String),
      retryable: false
    }
  });
}

describe("public scenario scope", () => {
  it("publishes exactly the four frozen scenarios", async () => {
    const response = await getScenarios();
    const body = await response.json();

    expect(body.scenarios.map(({ id }: { id: string }) => id)).toEqual([
      "marriott_hotel_walk",
      "us_airline_disruption",
      "us_denied_boarding",
      "eu_uk_air_disruption"
    ]);
  });

  it.each([
    { description: "My flight was cancelled." },
    { issueType: "airline_cancellation" },
    { caseId: "uscf_aa127_mechanical_delay_overnight_2026_07" },
    { facts: {} }
  ])("rejects noncanonical analyze input", async (body) => {
    const response = await analyzeRequest(body);

    await expectUnprocessable(response);
  });

  it.each([
    ["baggage", { description: "My baggage has not arrived." }],
    ["insurance", { description: "My Amex travel protection claim was denied." }],
    ["property loss", { description: "I need help with a lost item at my hotel." }],
    ["unrelated hotel", { description: "The hotel charged incorrect billing on my folio." }],
    ["dormant case", { caseId: "uscf_delta_baggage_delay_2026_03" }]
  ])("rejects legacy %s input before analysis", async (_label, body) => {
    const response = await analyzeRequest(body);

    await expectUnprocessable(response);
  });

  it.each(["constructor", "toString", "__proto__"])(
    "rejects inherited legacy selector %s",
    async (issueType) => {
      const response = await analyzeRequest({ issueType });

      await expectUnprocessable(response);
    }
  );

  it.each([
    ["issueType", "baggage_delay"],
    ["issueType", "eu261_delay_or_cancellation"],
    ["selectedIssueType", "baggage_delay"],
    ["selectedIssueType", "eu261_delay_or_cancellation"]
  ] as const)("rejects canonical input polluted by %s=%s", async (selector, value) => {
    const prior = claimState({ incidentType: "airline_cancellation" });
    const response = await analyzeRequest({
      message: "No additional facts.",
      prior,
      baseRevision: 0,
      [selector]: value
    });

    await expectUnprocessable(response);
  });

  it.each([
    ["stale revision", { message: "new facts", prior: claimState({}, 2), baseRevision: 1 }],
    ["blank message", { message: "", prior: claimState(), baseRevision: 0 }],
    [
      "untrusted raw path",
      {
        message: "new facts",
        prior: { ...claimState(), unresolvedFields: ["origin.region"] },
        baseRevision: 0
      }
    ]
  ])("rejects malformed canonical input with %s", async (_label, body) => {
    const response = await analyzeRequest(body);

    await expectUnprocessable(response);
  });

  it("returns active scenarios only from server-resolved canonical state", async () => {
    const prior = claimState({
      incidentType: "airline_cancellation",
      providerType: "airline",
      operatingCarrier: "United",
      origin: { airport: "JFK" },
      destination: { airport: "LAX" },
      reasonCategory: "crew"
    });
    const response = await analyzeRequest({
      message: "No additional facts.",
      prior,
      baseRevision: 0,
      requestedMode: "local"
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty("context");
    expect(body.result.scenarioIds).toEqual(["us_airline_disruption"]);
    expect(body.result.primaryScenario).toBe("us_airline_disruption");
    expect(body.result.derivedContext.originRegion.value).toBe("US");
  });

  it("keeps a needs-information context while preserving its published empty scenario set", async () => {
    const prior = claimState({
      incidentType: "airline_delay",
      operatingCarrier: "United",
      origin: { airport: "JFK" }
    });
    const response = await analyzeRequest({
      message: "No additional facts.",
      prior,
      baseRevision: 0
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty("context");
    expect(body.result.derivedContext).not.toBeNull();
    expect(body.result.status).toBe("needs_information");
    expect(body.result.scenarioIds).toEqual([]);
    expect(body.result.primaryScenario).toBeNull();
    expect(body.result.assessments.length).toBeGreaterThan(0);
  });

  it("returns a fully empty blocked domain result and no derived context", async () => {
    const prior = claimState({
      incidentType: "hotel_walk",
      providerType: "hotel",
      provider: "Hyatt",
      confirmedHotelReservation: true,
      wasWalked: true
    });
    const response = await analyzeRequest({
      message: "No additional facts.",
      prior,
      baseRevision: 0
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty("context");
    expect(body.result).toMatchObject({
      status: "out_of_scope",
      primaryScenario: null,
      scenarioIds: [],
      factReview: null,
      derivedContext: null,
      policyApplicability: [],
      assessments: [],
      officialSources: [],
      providerCommitments: [],
      similarCases: [],
      scripts: []
    });
  });

  it.each([
    ["analyze", analyzeRequest],
    ["canonical intake", intakeRequest]
  ] as const)("returns an HTTP 200 high-risk result from the %s route", async (route, send) => {
    const response = await send({
      message: "There is an active fire and I need emergency help",
      prior: claimState(),
      baseRevision: 0,
      requestedMode: "local"
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    if (route === "analyze") {
      expect(body).not.toHaveProperty("context");
      expect(body.result.factReview).toBeNull();
      expect(body.result.derivedContext).toBeNull();
    } else {
      expect(body.context).toBeNull();
    }
    expect(body.result.status).toBe("unsupported_high_risk");
    expect(body.result.extraction.notRunReason).toBe("preflight_guard");
  });
});
