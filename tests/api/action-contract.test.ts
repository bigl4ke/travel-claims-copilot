import { describe, expect, it } from "vitest";

import { POST } from "../../app/api/action/route";
import { emptyClaimFacts, normalizeClaimFacts } from "../../lib/claimFacts";

const facts = normalizeClaimFacts({
  ...emptyClaimFacts(),
  issueType: "airline_cancellation",
  providerType: "airline",
  provider: "United",
  operatingCarrier: "United",
  disruptingCarrier: "United",
  origin: { city: "Chicago", airport: "ORD", country: "United States", region: "US" },
  destination: { city: null, airport: null, country: "China", region: "CN" },
  disruptionType: "cancellation",
  disruptionReasonStatus: "unavailable",
  journeyStage: "at_airport",
  disruptionTiming: "close_in_irrops"
});

function request(body: unknown, contentType = "application/json") {
  return new Request("http://localhost/api/action", {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify(body)
  });
}

describe("action API", () => {
  it("returns a deterministic script when no model is configured", async () => {
    const response = await POST(
      request({ kind: "script", facts, channel: "airport_counter", language: "en" })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      channel: "airport_counter",
      language: "en",
      generatedBy: "deterministic"
    });
  });

  it("accepts provider feedback and returns a new action", async () => {
    const response = await POST(
      request({ kind: "provider_feedback", facts, feedback: "We cannot rebook you." })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.signals.responseStatus).toBe("denied");
    expect(body.nextAction.headline).toContain("denial in writing");
  });

  it("rejects non-JSON requests", async () => {
    const response = await POST(request({}, "text/plain"));
    expect(response.status).toBe(415);
  });
});
