import { describe, expect, it } from "vitest";

import { POST as analyze } from "../../app/api/analyze/route";
import { GET as getScenarios } from "../../app/api/scenarios/route";

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

  it("returns a safe out-of-scope envelope for a dormant incident", async () => {
    const response = await analyze(
      new Request("http://local/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ issueType: "baggage_delay" })
      })
    );
    expect(await response.json()).toEqual({
      status: "out_of_scope",
      primaryScenario: null,
      scenarioIds: [],
      missingFacts: [],
      assessments: [],
      cautions: ["This competition build supports four frozen travel-disruption journeys."],
      nextActions: []
    });
  });
});
