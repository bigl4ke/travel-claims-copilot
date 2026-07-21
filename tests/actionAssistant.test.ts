import { describe, expect, it, vi } from "vitest";

import {
  analyzeProviderFeedback,
  generateActionScript,
  nextActionAfterProviderFeedback
} from "../lib/actionAssistant";
import { emptyClaimFacts, normalizeClaimFacts } from "../lib/claimFacts";
import type { StructuredOutputClient } from "../lib/llm";
import type { ActionPlan } from "../lib/types";

function actionPlan(overrides: Partial<ActionPlan> = {}): ActionPlan {
  return {
    status: "actionable",
    situation: "close_in_irrops",
    headline: "Ask United to restore your trip before discussing compensation.",
    contactNow: {
      role: "disrupting_airline",
      name: "United",
      reason: "United can restore the disrupted flight."
    },
    primaryAsk: "Ask for the earliest reasonable onward itinerary.",
    askNext: ["Ask for a partner-airline option."],
    evidenceNow: ["Cancellation notice"],
    ifTheySayNo: ["Request a supervisor review."],
    uncertainties: ["The cause is unknown."],
    references: [
      {
        id: "dot_refund",
        title: "DOT refund rule",
        url: "https://example.com/dot",
        kind: "official",
        note: "Official source."
      }
    ],
    sourceIds: ["dot_refund"],
    providerFeedbackPrompt: "Paste the reply.",
    notGuaranteed: true,
    ...overrides
  };
}

function clientReturning(value: unknown): StructuredOutputClient {
  return { generate: vi.fn().mockResolvedValue(value) };
}

describe("action script composer", () => {
  it("lets the model verbalize the plan while retaining server-owned citations", async () => {
    const client = clientReturning({
      opening: "Hello.",
      situation: "My confirmed flight was cancelled at the airport.",
      request: "Please put me on the earliest reasonable onward itinerary.",
      fallback: "If unavailable, please check a partner-airline option.",
      closing: "Please confirm this in writing."
    });
    const result = await generateActionScript({
      facts: normalizeClaimFacts({
        ...emptyClaimFacts(),
        issueType: "airline_cancellation",
        providerType: "airline",
        provider: "United",
        disruptionType: "cancellation",
        journeyStage: "at_airport"
      }),
      actionPlan: actionPlan(),
      channel: "airport_counter",
      language: "en",
      tone: "polite_firm",
      client
    });

    expect(result.generatedBy).toBe("llm");
    expect(result.text).toContain("earliest reasonable onward itinerary");
    expect(result.sourceIds).toEqual(["dot_refund"]);
    expect(client.generate).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 1_200 })
    );
  });

  it("rejects an invented currency amount and falls back deterministically", async () => {
    const result = await generateActionScript({
      facts: emptyClaimFacts(),
      actionPlan: actionPlan(),
      channel: "chat",
      language: "en",
      tone: "polite",
      client: clientReturning({
        opening: "Hello.",
        situation: "My flight was cancelled.",
        request: "Pay me $500.",
        fallback: "Escalate this.",
        closing: "Thanks."
      })
    });

    expect(result.generatedBy).toBe("deterministic");
    expect(result.text).not.toContain("$500");
    expect(result.text).toContain("earliest reasonable onward itinerary");
  });
});

describe("provider feedback loop", () => {
  it("turns a denial without a reason into one documented escalation", async () => {
    const result = await analyzeProviderFeedback({
      feedback: "We cannot do that. Your case number is UA-12345.",
      currentAction: actionPlan()
    });

    expect(result.extractionMode).toBe("deterministic");
    expect(result.signals).toMatchObject({
      responseStatus: "denied",
      reason: null,
      caseNumber: "UA-12345"
    });
    expect(result.nextAction.headline).toContain("denial in writing");
    expect(result.nextAction.uncertainties[0]).toContain("not given a usable reason");
  });

  it("uses LLM extraction only for signals and chooses the next action in code", async () => {
    const result = await analyzeProviderFeedback({
      feedback: "We can move you to tomorrow morning.",
      currentAction: actionPlan(),
      client: clientReturning({
        summary: "United offered a flight tomorrow morning.",
        responseStatus: "partial_offer",
        acknowledgedProblem: true,
        reason: null,
        offer: "A confirmed flight tomorrow morning",
        caseNumber: null,
        unanswered: ["Whether an earlier partner flight is available"]
      })
    });

    expect(result.extractionMode).toBe("llm");
    expect(result.nextAction.headline).toContain("Check the offer");
    expect(result.nextAction.primaryAsk).toContain("confirmed flight tomorrow morning");
    expect(result.nextAction.sourceIds).toEqual(["dot_refund"]);
  });

  it("recognizes an explicitly completed provider action without a model", async () => {
    const result = await analyzeProviderFeedback({
      feedback: "We have rebooked you on the 8:00 AM flight and it is confirmed.",
      currentAction: actionPlan()
    });

    expect(result.signals.responseStatus).toBe("approved");
    expect(result.nextAction.headline).toContain("Verify the promised resolution");
  });

  it("keeps deterministic transition logic independently testable", () => {
    const next = nextActionAfterProviderFeedback(actionPlan(), {
      responseStatus: "no_decision",
      acknowledgedProblem: false,
      reason: null,
      offer: null,
      caseNumber: null,
      unanswered: ["No answer to the rebooking request"]
    });

    expect(next.primaryAsk).toContain("answer the primary request directly");
    expect(next.references).toEqual(actionPlan().references);
  });
});
