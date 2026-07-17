import { describe, expect, it } from "vitest";

import { emptyClaimFacts, type ClaimFacts } from "../lib/claimFacts";
import { processIntake, type IntakeResult } from "../lib/intake";

async function runConversation(messages: string[]): Promise<IntakeResult> {
  let facts: ClaimFacts = emptyClaimFacts();
  let result: IntakeResult | undefined;

  for (const message of messages) {
    result = await processIntake(message, facts, { llmClient: null });
    facts = result.facts;
  }

  if (!result) {
    throw new Error("An evaluation conversation needs at least one user message");
  }

  return result;
}

describe("conversational intake evaluations", () => {
  it("understands a colloquial Chinese Marriott walk", async () => {
    const result = await runConversation([
      "我是万豪钛金，官网订的喜来登，到了前台说酒店超售，今晚没有房间。"
    ]);

    expect(result.status).toBe("ready");
    expect(result.facts).toMatchObject({
      issueType: "hotel_walk",
      provider: "Marriott",
      bookingChannel: "direct",
      loyaltyStatus: "Titanium"
    });
  });

  it("collects a natural EU itinerary over two turns", async () => {
    const result = await runConversation([
      "My Air France flight from Paris was cancelled and I arrived four hours late.",
      "I was flying to New York and the airline said it was a mechanical issue."
    ]);

    expect(result.status).toBe("ready");
    expect(result.facts.issueType).toBe("eu261_delay_or_cancellation");
    expect(result.facts.origin.country).toBe("France");
    expect(result.facts.destination.country).toBe("United States");
    expect(result.facts.arrivalDelayMinutes).toBe(240);
  });

  it("asks for and merges a missing hotel name", async () => {
    const result = await runConversation([
      "The hotel had no room for my confirmed reservation when I arrived.",
      "It was a Marriott property."
    ]);

    expect(result.status).toBe("ready");
    expect(result.facts.issueType).toBe("hotel_walk");
    expect(result.facts.provider).toBe("Marriott");
  });

  it("lets a later answer correct denied-boarding kind", async () => {
    const result = await runConversation([
      "My Delta flight was oversold and the gate agent asked for volunteers.",
      "I did not volunteer. They removed me from the flight anyway."
    ]);

    expect(result.facts.issueType).toBe("denied_boarding");
    expect(result.facts.deniedBoardingKind).toBe("involuntary");
  });

  it("does not turn a weather cancellation into a controllable claim", async () => {
    const result = await runConversation([
      "United cancelled my flight because of a snowstorm and moved me to tomorrow."
    ]);

    expect(result.status).toBe("needs_info");
    expect(result.facts.issueType).toBe("unknown");
    expect(result.facts.disruptionReason).toBe("weather");
  });
});

