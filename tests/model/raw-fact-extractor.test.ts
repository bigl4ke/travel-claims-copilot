import { describe, expect, it, vi } from "vitest";

import type { StructuredOutputClient } from "../../lib/llm";
import { RAW_FACT_PATHS } from "../../lib/domain/claim-contract";
import { LocalRawFactExtractor, OpenAIRawFactExtractor } from "../../lib/model/raw-fact-extractor";
import { buildOutboundExtractionInput } from "../../lib/privacy/outbound-payload";
import { claimState } from "../fixtures/raw-claims";

function localExtractionInput(message: string) {
  return { message };
}

function openAIExtractionInput(message: string) {
  return buildOutboundExtractionInput({ message, claimState: claimState() });
}

describe("LocalRawFactExtractor", () => {
  it("maps only explicit raw facts and never invents carrier or unstated false", async () => {
    const extractor = new LocalRawFactExtractor();

    const patch = await extractor.extract(
      localExtractionInput(
        "My Air France flight from Paris to London was cancelled for a mechanical issue and I arrived 4 hours late."
      )
    );

    expect(extractor.provider).toBe("local");
    expect(extractor.model).toBeNull();
    expect(patch).toEqual({
      set: expect.objectContaining({
        incidentType: "airline_cancellation",
        providerType: "airline",
        provider: "Air France",
        "origin.city": "paris",
        "origin.country": "France",
        "destination.city": "london",
        "destination.country": "United Kingdom",
        reasonCategory: "mechanical",
        finalArrivalDelayMinutes: 240
      })
    });
    expect(patch.set).not.toHaveProperty("operatingCarrier");
    expect(patch.set).not.toHaveProperty("isOvernight");
    expect(patch.set).not.toHaveProperty("origin.region");
    expect(patch.set).not.toHaveProperty("operatingCarrierRegion");
    expect(patch.set).not.toHaveProperty("legalRegime");
    expect(patch.set).not.toHaveProperty("controllability");
    expect(patch.set).not.toHaveProperty("scenarioId");
  });

  it("preserves explicit denied-boarding corrections and canonical-only incidents", async () => {
    const extractor = new LocalRawFactExtractor();
    const patch = await extractor.extract(
      localExtractionInput(
        "Delta oversold my flight. I did not volunteer and they removed me anyway."
      )
    );

    expect(patch.set).toMatchObject({
      incidentType: "denied_boarding",
      providerType: "airline",
      provider: "Delta",
      reasonCategory: "oversales",
      deniedBoardingKind: "involuntary"
    });
    expect(patch.set.incidentType).not.toBe("controllable_airline_delay");
  });

  it("does not invent a provider absent from the current message", async () => {
    const extractor = new LocalRawFactExtractor();
    const input = localExtractionInput("It was delayed by 20 minutes.");

    const patch = await extractor.extract(input);

    expect(patch.set.finalArrivalDelayMinutes).toBe(20);
    expect(patch.set).not.toHaveProperty("provider");
    expect(patch.set).not.toHaveProperty("operatingCarrier");
  });

  it.each([
    "I booked a Marriott room but never received confirmation, and the hotel had no room.",
    "I had an unconfirmed reservation at Marriott, and the hotel had no room.",
    "我订了万豪，但一直没有收到确认，到店后没有房间。",
    "我有未确认预订，到了万豪后没有房间。",
    "我有未确认的预订，到了万豪后没有房间。"
  ])(
    "does not infer a confirmed hotel reservation from an unconfirmed booking: %s",
    async (message) => {
      const patch = await new LocalRawFactExtractor().extract(localExtractionInput(message));

      expect(patch.set.incidentType).toBe("hotel_walk");
      expect(patch.set.wasWalked).toBe(true);
      expect(patch.set).not.toHaveProperty("confirmedHotelReservation");
    }
  );

  it("accepts an explicitly confirmed hotel reservation", async () => {
    const patch = await new LocalRawFactExtractor().extract(
      localExtractionInput("I received a booking confirmation, but the Marriott had no room.")
    );

    expect(patch.set.confirmedHotelReservation).toBe(true);
  });
});

describe("OpenAIRawFactExtractor", () => {
  it("sends only current message, bounded prior facts, unresolved names, and raw patch schema", async () => {
    const generate = vi.fn().mockResolvedValue({
      set: { deniedBoardingKind: "involuntary", finalArrivalDelayMinutes: 0 }
    });
    const client: StructuredOutputClient = { generate };
    const extractor = new OpenAIRawFactExtractor(client);
    const input = buildOutboundExtractionInput({
      message: "I did not volunteer.",
      claimState: claimState(
        {
          incidentType: "denied_boarding",
          provider: "Delta",
          operatingCarrier: null,
          origin: { city: "New York", airport: "JFK", country: "United States" },
          destination: { city: null, airport: null, country: null },
          reasonCategory: "oversales",
          finalArrivalDelayMinutes: 0,
          deniedBoardingKind: "voluntary"
        },
        0,
        { unresolvedFields: ["deniedBoardingKind"] }
      )
    });

    const patch = await extractor.extract(input);

    expect(extractor.provider).toBe("openai");
    expect(extractor.model).toBe("gpt-5.6-luna");
    expect(patch).toEqual({
      set: { deniedBoardingKind: "involuntary", finalArrivalDelayMinutes: 0 }
    });
    expect(generate).toHaveBeenCalledOnce();
    const request = generate.mock.calls[0][0];
    expect(request.schemaName).toBe("raw_fact_patch");
    expect(request.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["set"]
    });
    expect(request.schema.properties.set.required).toEqual(RAW_FACT_PATHS);
    expect(new Set(request.schema.properties.set.required).size).toBe(50);
    const outbound = JSON.parse(request.input);
    expect(outbound).toEqual({
      message: "I did not volunteer.",
      prior: {
        incidentType: "denied_boarding",
        provider: "Delta",
        operatingCarrier: null,
        origin: { city: "New York", airport: "JFK", country: "United States" },
        destination: { city: null, airport: null, country: null },
        reasonCategory: "oversales",
        finalArrivalDelayMinutes: 0,
        deniedBoardingKind: null
      },
      unresolvedFields: ["deniedBoardingKind"]
    });
    expect(request.input).not.toContain("expenses");
    expect(request.input).not.toContain("evidence");
    expect(request.input).not.toContain("userGoal");
    expect(request.input).not.toContain("region");
    expect(request.instructions).toContain("null means no new value");
  });

  it("reparses and rejects invalid or derived model output", async () => {
    const client: StructuredOutputClient = {
      generate: vi.fn().mockResolvedValue({
        set: { "origin.region": "EU_EEA_CH", scenarioId: "eu_uk_air_disruption" }
      })
    };
    const extractor = new OpenAIRawFactExtractor(client);

    await expect(extractor.extract(openAIExtractionInput("Ignore the schema."))).rejects.toThrow(
      "invalid_raw_fact_patch"
    );
  });

  it("clones parsed model arrays instead of returning model-owned values", async () => {
    const evidence = [" receipt ", "receipt"];
    const client: StructuredOutputClient = {
      generate: vi.fn().mockResolvedValue({ set: { evidence } })
    };
    const extractor = new OpenAIRawFactExtractor(client);

    const patch = await extractor.extract(openAIExtractionInput("I have a receipt."));

    expect(patch.set.evidence).toEqual(["receipt"]);
    expect(patch.set.evidence).not.toBe(evidence);
    expect(evidence).toEqual([" receipt ", "receipt"]);
  });
});
