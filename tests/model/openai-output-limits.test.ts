import { describe, expect, it, vi } from "vitest";

import { processClaimTurn } from "../../lib/claim-workflow";
import type { KnowledgeRepository } from "../../lib/knowledge/knowledge-contract";
import { OpenAIResponsesClient, type StructuredOutputClient } from "../../lib/llm";
import { OpenAIRawFactExtractor, type RawFactExtractor } from "../../lib/model/raw-fact-extractor";
import { buildOutboundExtractionInput } from "../../lib/privacy/outbound-payload";
import { knowledgeSnapshotFixture } from "../fixtures/knowledge";
import { claimState } from "../fixtures/raw-claims";

function responseWithOutputText(text: string): Response {
  return new Response(
    JSON.stringify({
      output: [{ content: [{ type: "output_text", text }] }]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function extractionInput(message = "A current bounded message.") {
  return buildOutboundExtractionInput({ message, claimState: claimState() });
}

describe("OpenAI structured-output bounds", () => {
  it("serializes the hard 1,200-token output ceiling", async () => {
    const fetcher = vi.fn().mockResolvedValue(responseWithOutputText('{"set":{}}'));
    const client = new OpenAIResponsesClient({ apiKey: "test-key", fetcher });

    await client.generate({
      schemaName: "raw_fact_patch",
      schema: { type: "object" },
      instructions: "Return a sparse patch.",
      input: "A current bounded message.",
      maxOutputTokens: 1_200
    });

    const outbound = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(outbound.max_output_tokens).toBe(1_200);
  });

  it("rejects more than 64 KiB by UTF-8 bytes before attempting JSON parsing", async () => {
    const oversizedUtf8 = "é".repeat(32_769);
    expect(oversizedUtf8.length).toBeLessThan(64 * 1_024);
    expect(new TextEncoder().encode(oversizedUtf8).byteLength).toBeGreaterThan(64 * 1_024);
    const client = new OpenAIResponsesClient({
      apiKey: "test-key",
      fetcher: vi.fn().mockResolvedValue(responseWithOutputText(oversizedUtf8))
    });

    await expect(
      client.generate({
        schemaName: "raw_fact_patch",
        schema: { type: "object" },
        instructions: "Return a sparse patch.",
        input: "A current bounded message.",
        maxOutputTokens: 1_200
      })
    ).rejects.toThrow("model_output_too_large");
  });

  it("passes the same hard token ceiling from the raw extractor to its client", async () => {
    const generate = vi.fn().mockResolvedValue({ set: {} });
    const extractor = new OpenAIRawFactExtractor({ generate });

    await extractor.extract(extractionInput());

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 1_200 }));
  });
});

describe("fail-closed model patches", () => {
  it("rejects a schema-invalid model patch before merge or knowledge access", async () => {
    const prior = claimState({ provider: "United" });
    const modelClient: StructuredOutputClient = {
      generate: vi.fn().mockResolvedValue({
        set: { provider: "Delta", "origin.region": "US" }
      })
    };
    const localExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: { provider: "Delta" } })
    } satisfies RawFactExtractor;
    const openaiExtractor = new OpenAIRawFactExtractor(modelClient);
    const load = vi.fn().mockResolvedValue(knowledgeSnapshotFixture());
    const knowledgeRepository = { load } satisfies KnowledgeRepository;

    await expect(
      processClaimTurn(
        {
          message: "The carrier was Delta.",
          prior,
          baseRevision: 0,
          requestedMode: "gpt"
        },
        {
          localExtractor,
          openaiExtractor,
          knowledgeRepository,
          now: () => "2026-07-19"
        }
      )
    ).rejects.toThrow("invalid_raw_fact_patch");

    expect(prior).toEqual(claimState({ provider: "United" }));
    expect(prior.revision).toBe(0);
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects over-limit model values instead of normalizing or merging them", async () => {
    const client: StructuredOutputClient = {
      generate: vi.fn().mockResolvedValue({ set: { provider: "é".repeat(257) } })
    };
    const extractor = new OpenAIRawFactExtractor(client);

    await expect(extractor.extract(extractionInput())).rejects.toThrow("invalid_raw_fact_patch");
  });
});
