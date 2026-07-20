import { describe, expect, it, vi } from "vitest";

import { POST as analyzePost } from "../app/api/analyze/route";
import { POST as intakePost } from "../app/api/intake/route";
import { emptyClaimFacts } from "../lib/claimFacts";
import {
  MAX_ANALYZE_DESCRIPTION_LENGTH,
  MAX_INTAKE_MESSAGE_LENGTH
} from "../lib/inputLimits";
import { processIntake } from "../lib/intake";
import { assessHighRiskClaim } from "../lib/safety";
import type { StructuredOutputClient } from "../lib/llm";

describe("professional-help safety boundary", () => {
  it.each([
    ["I was injured at the hotel and hospitalized.", "personal_injury"],
    ["I want to sue the airline in court.", "litigation"],
    ["My laptop was stolen from the hotel room.", "major_property_loss"],
    ["The insurer denied my claim and I have a coverage dispute.", "complex_insurance"],
    ["酒店事故导致我受伤住院。", "personal_injury"]
  ])("routes %s to professional help", (message, category) => {
    expect(assessHighRiskClaim(message)?.category).toBe(category);
  });

  it("does not flag an ordinary supported disruption", () => {
    expect(
      assessHighRiskClaim("My Air France flight from Paris was cancelled.")
    ).toBeUndefined();
  });

  it("stops before calling the LLM or retrieval workflow", async () => {
    const client: StructuredOutputClient = { generate: vi.fn() };
    const result = await processIntake(
      "My laptop was stolen from the hotel room.",
      emptyClaimFacts(),
      { llmClient: client }
    );

    expect(result.status).toBe("unsupported");
    expect(result.safety?.category).toBe("major_property_loss");
    expect(client.generate).not.toHaveBeenCalled();
  });

  it("rejects oversized intake messages", async () => {
    const response = await intakePost(
      new Request("http://localhost/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "x".repeat(MAX_INTAKE_MESSAGE_LENGTH + 1) })
      })
    );

    expect(response.status).toBe(413);
  });

  it("blocks a direct high-risk analyze request", async () => {
    const response = await analyzePost(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "My expensive watch was stolen from the hotel room."
        })
      })
    );
    const result = await response.json();

    expect(response.status).toBe(422);
    expect(result.safety.category).toBe("major_property_loss");
  });

  it("rejects oversized analyze descriptions", async () => {
    const response = await analyzePost(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "x".repeat(MAX_ANALYZE_DESCRIPTION_LENGTH + 1)
        })
      })
    );

    expect(response.status).toBe(413);
  });
});
