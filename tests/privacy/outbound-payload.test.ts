import { describe, expect, it, vi } from "vitest";

import { processClaimTurn } from "../../lib/claim-workflow";
import type { ClaimState } from "../../lib/domain/claim-contract";
import { RAW_FACT_PATHS } from "../../lib/domain/claim-contract";
import { OpenAIResponsesClient } from "../../lib/llm";
import { OpenAIRawFactExtractor } from "../../lib/model/raw-fact-extractor";
import { buildOutboundExtractionInput } from "../../lib/privacy/outbound-payload";
import { knowledgeSnapshotFixture } from "../fixtures/knowledge";
import { claimState } from "../fixtures/raw-claims";

function responseWithPatch(): Response {
  return new Response(
    JSON.stringify({
      output: [{ content: [{ type: "output_text", text: '{"set":{}}' }] }]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("buildOutboundExtractionInput", () => {
  it("builds the sole allowlisted payload from resolution facts in canonical path order", () => {
    const prior = claimState(
      {
        incidentType: "airline_cancellation",
        providerType: "airline",
        provider: "Stored Conflict Carrier",
        brandOrProperty: "Private Brand",
        operatingCarrier: "Old Operating Carrier",
        origin: { city: "Paris", airport: "CDG", country: "France" },
        destination: { city: "New York", airport: "JFK", country: "United States" },
        statedReason: "A private transcript fragment",
        reasonCategory: "crew",
        finalArrivalDelayMinutes: 180,
        deniedBoardingKind: null,
        expenses: ["Synthetic hotel receipt 7788"],
        evidence: ["Synthetic ticket image"],
        userGoal: "Send a private complaint"
      },
      4,
      {
        provenance: {
          provider: { source: "deterministic_extraction", factsRevision: 3 },
          "origin.airport": { source: "user_message", factsRevision: 2 }
        },
        conflicts: [
          {
            field: "provider",
            candidates: [
              { value: "Carrier A", source: "deterministic_extraction" },
              { value: "Carrier B", source: "openai_extraction" }
            ]
          }
        ],
        unresolvedFields: ["userGoal", "origin.airport", "provider", "evidence"]
      }
    );

    const outbound = buildOutboundExtractionInput({
      message:
        "Email synthetic.traveler@example.test; booking reference BK-729104. Flight AF123 was delayed 180 minutes.",
      claimState: prior
    });

    expect(outbound).toMatchInlineSnapshot(`
      {
        "message": "Email [REDACTED_EMAIL]; booking reference [REDACTED_IDENTIFIER]. Flight AF123 was delayed 180 minutes.",
        "prior": {
          "deniedBoardingKind": null,
          "destination": {
            "airport": "JFK",
            "city": "New York",
            "country": "United States",
          },
          "finalArrivalDelayMinutes": 180,
          "incidentType": "airline_cancellation",
          "operatingCarrier": "Old Operating Carrier",
          "origin": {
            "airport": null,
            "city": "Paris",
            "country": "France",
          },
          "provider": null,
          "reasonCategory": "crew",
        },
        "unresolvedFields": [
          "provider",
          "origin.airport",
        ],
      }
    `);
    expect(Object.keys(outbound)).toEqual(["message", "prior", "unresolvedFields"]);
    expect(outbound.unresolvedFields).toEqual(
      RAW_FACT_PATHS.filter((path) => path === "provider" || path === "origin.airport")
    );
    const serialized = JSON.stringify(outbound);
    [
      "transcript",
      "region",
      "assessment",
      "expenses",
      "evidence",
      "userGoal",
      "feedback",
      "code",
      "headers",
      "Stored Conflict Carrier",
      "Carrier A",
      "Carrier B"
    ].forEach((forbidden) => expect(serialized).not.toContain(forbidden));
  });

  it("gives the Local adapter only the original message and no mutable claim-state reference", async () => {
    const message = "Booking #ABC123 was not honored at the synthetic hotel.";
    const prior = claimState({
      incidentType: "hotel_walk",
      providerType: "hotel",
      provider: "Hyatt",
      confirmedHotelReservation: true,
      wasWalked: true
    });
    const originalPrior = structuredClone(prior);
    const localExtract = vi.fn(async (input: Record<string, unknown>) => {
      if ("claimState" in input) {
        const leakedState = input.claimState as ClaimState;
        leakedState.facts.provider = "Mutated by adapter";
      }
      return { set: {} };
    });

    await processClaimTurn(
      { message, prior, baseRevision: 0, requestedMode: "local" },
      {
        localExtractor: { provider: "local", model: null, extract: localExtract },
        knowledgeRepository: { load: async () => knowledgeSnapshotFixture() },
        now: () => "2026-07-20"
      }
    );

    expect(localExtract).toHaveBeenCalledOnce();
    expect(localExtract).toHaveBeenCalledWith({ message });
    expect(Object.keys(localExtract.mock.calls[0][0])).toEqual(["message"]);
    expect(prior).toEqual(originalPrior);
  });

  it("gives the OpenAI adapter only the exact redacted allowlisted payload", async () => {
    const message =
      "Booking #ABC123 belongs to synthetic.traveler@example.test. Flight AF1234 CDG to JFK was delayed 180 minutes.";
    const prior = claimState({
      incidentType: "hotel_walk",
      providerType: "hotel",
      provider: "Hyatt",
      brandOrProperty: "Private synthetic property",
      confirmedHotelReservation: true,
      wasWalked: true,
      expenses: ["Private synthetic expense"],
      evidence: ["Private synthetic evidence"],
      userGoal: "Private synthetic goal"
    });
    const openaiExtract = vi.fn().mockResolvedValue({ set: {} });

    await processClaimTurn(
      { message, prior, baseRevision: 0, requestedMode: "gpt" },
      {
        localExtractor: {
          provider: "local",
          model: null,
          extract: vi.fn().mockResolvedValue({ set: {} })
        },
        openaiExtractor: {
          provider: "openai",
          model: "gpt-5.6-luna",
          extract: openaiExtract
        },
        knowledgeRepository: { load: async () => knowledgeSnapshotFixture() },
        now: () => "2026-07-20"
      }
    );

    const expected = buildOutboundExtractionInput({ message, claimState: prior });
    expect(openaiExtract).toHaveBeenCalledOnce();
    expect(openaiExtract).toHaveBeenCalledWith(expected);
    expect(Object.keys(openaiExtract.mock.calls[0][0])).toEqual([
      "message",
      "prior",
      "unresolvedFields"
    ]);
    expect(JSON.stringify(openaiExtract.mock.calls)).not.toContain("Private synthetic");
  });

  it("redacts and allowlists the real extractor to Responses-client fetch boundary with store false", async () => {
    const fetcher = vi.fn().mockResolvedValue(responseWithPatch());
    const client = new OpenAIResponsesClient({ apiKey: "synthetic-test-key", fetcher });
    const extractor = new OpenAIRawFactExtractor(client);
    const input = buildOutboundExtractionInput({
      message:
        "Booking reference BK-729104 belongs to synthetic.traveler@example.test. Flight AF123 CDG to JFK was delayed 180 minutes.",
      claimState: claimState({
        incidentType: "airline_delay",
        providerType: "airline",
        provider: "Air France",
        operatingCarrier: "Air France",
        origin: { city: "Paris", airport: "CDG", country: "France" },
        destination: { city: "New York", airport: "JFK", country: "United States" },
        reasonCategory: "mechanical",
        finalArrivalDelayMinutes: 180,
        expenses: ["Private synthetic expense"],
        evidence: ["Private synthetic evidence"],
        userGoal: "Private synthetic goal"
      })
    });

    await extractor.extract(input);

    expect(fetcher).toHaveBeenCalledOnce();
    const request = fetcher.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.store).toBe(false);
    expect(JSON.parse(body.input)).toMatchInlineSnapshot(`
      {
        "message": "Booking reference [REDACTED_IDENTIFIER] belongs to [REDACTED_EMAIL]. Flight AF123 CDG to JFK was delayed 180 minutes.",
        "prior": {
          "deniedBoardingKind": null,
          "destination": {
            "airport": "JFK",
            "city": "New York",
            "country": "United States",
          },
          "finalArrivalDelayMinutes": 180,
          "incidentType": "airline_delay",
          "operatingCarrier": "Air France",
          "origin": {
            "airport": "CDG",
            "city": "Paris",
            "country": "France",
          },
          "provider": "Air France",
          "reasonCategory": "mechanical",
        },
        "unresolvedFields": [],
      }
    `);
    expect(JSON.stringify(body)).not.toContain("BK-729104");
    expect(JSON.stringify(body)).not.toContain("synthetic.traveler@example.test");
    expect(JSON.stringify(body)).not.toContain("Private synthetic");
  });
});
