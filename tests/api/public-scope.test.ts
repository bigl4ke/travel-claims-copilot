import { describe, expect, it } from "vitest";

import { POST as analyze } from "../../app/api/analyze/route";
import { GET as getScenarios } from "../../app/api/scenarios/route";
import { emptyClaimFacts, normalizeClaimFacts } from "../../lib/claimFacts";

const safeOutOfScopeEnvelope = {
  status: "out_of_scope",
  primaryScenario: null,
  scenarioIds: [],
  missingFacts: [],
  assessments: [],
  cautions: ["This competition build supports four frozen travel-disruption journeys."],
  nextActions: []
};

async function analyzeBody(body: Record<string, unknown>) {
  const response = await analyze(
    new Request("http://local/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );

  return response.json();
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

  it("keeps the EU legacy alias unresolved without incident subtype", async () => {
    const response = await analyze(
      new Request("http://local/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ issueType: "eu261_delay_or_cancellation" })
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "needs_information" });
  });

  it("lets an approved canonical case override the ambiguous EU alias", async () => {
    const body = await analyzeBody({
      caseId: "uscf_aa127_mechanical_delay_overnight_2026_07",
      issueType: "eu261_delay_or_cancellation"
    });

    expect(body).toMatchObject({ issueType: "airline_delay" });
    expect(body).not.toHaveProperty("status", "needs_information");
  });

  it("fails closed when an approved dormant case overrides the ambiguous EU alias", async () => {
    expect(
      await analyzeBody({
        caseId: "uscf_delta_baggage_delay_2026_03",
        issueType: "eu261_delay_or_cancellation"
      })
    ).toEqual(safeOutOfScopeEnvelope);
  });

  it("returns a safe out-of-scope envelope for a dormant incident", async () => {
    expect(await analyzeBody({ issueType: "baggage_delay" })).toEqual(safeOutOfScopeEnvelope);
  });

  it.each([
    ["baggage", { description: "My baggage has not arrived." }],
    ["insurance", { description: "My Amex travel protection claim was denied." }],
    ["property loss", { description: "I need help with a lost item at my hotel." }],
    ["unrelated hotel", { description: "The hotel charged incorrect billing on my folio." }],
    ["approved dormant case", { caseId: "uscf_delta_baggage_delay_2026_03" }]
  ])("fails closed for %s input before legacy analysis", async (_label, body) => {
    expect(await analyzeBody(body)).toEqual(safeOutOfScopeEnvelope);
  });

  it("keeps ordinary unknown text on the legacy fallback path", async () => {
    const body = await analyzeBody({ description: "I need help understanding my travel problem." });

    expect(body).toMatchObject({ issueType: "unknown" });
    expect(body).not.toHaveProperty("status", "out_of_scope");
  });

  it.each(["constructor", "toString", "__proto__"])(
    "treats inherited selector key %s as invalid input",
    async (issueType) => {
      const response = await analyze(
        new Request("http://local/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ issueType })
        })
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Please provide a travel dispute description, issueType, or caseId."
      });
    }
  );

  it("does not reclassify validated structured facts from the description", async () => {
    const facts = normalizeClaimFacts({
      ...emptyClaimFacts(),
      issueType: "airline_cancellation",
      provider: "Delta",
      operatingCarrier: "Delta",
      origin: { city: "New York", airport: "JFK", country: null, region: null },
      destination: { city: "Los Angeles", airport: "LAX", country: null, region: null },
      disruptionType: "cancellation",
      disruptionReason: "mechanical",
      arrivalDelayMinutes: 180,
      confidence: "high"
    });
    const body = await analyzeBody({ description: "My baggage has not arrived.", facts });

    expect(body).toMatchObject({ issueType: "airline_cancellation" });
    expect(body).not.toHaveProperty("status", "out_of_scope");
  });
});
