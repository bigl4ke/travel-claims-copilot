import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/intake/route";
import { emptyClaimFacts, normalizeClaimFacts } from "../lib/claimFacts";
import { parseAnalyzeClaimRequest } from "../lib/api/analyze-contract";
import { createIntakePostHandler, processClaimTurn, processIntake } from "../lib/intake";
import type { RawFactExtractor } from "../lib/model/raw-fact-extractor";
import {
  createStructuredOutputClientFromEnv,
  DeepSeekChatCompletionsClient,
  OpenAIResponsesClient,
  resolveLlmProvider,
  type StructuredOutputClient
} from "../lib/llm";
import { claimState } from "./fixtures/raw-claims";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("deterministic intake fallback", () => {
  it("understands a natural Paris cancellation without an explicit EU261 keyword", async () => {
    const result = await processIntake(
      "My Air France flight from Paris was cancelled. I was rerouted and arrived at my final destination four hours late.",
      emptyClaimFacts(),
      { llmClient: null }
    );

    expect(result.facts.issueType).toBe("airline_cancellation");
    expect(result.facts.origin.country).toBe("France");
    expect(result.facts.arrivalDelayMinutes).toBe(240);
    expect(result.status).toBe("needs_info");
    expect(result.missingFields).toEqual(["destination", "disruptionReason"]);
  });

  it("merges a follow-up answer into prior facts", async () => {
    const first = await processIntake(
      "My Air France flight from Paris was cancelled and I arrived four hours late.",
      emptyClaimFacts(),
      { llmClient: null }
    );
    const second = await processIntake(
      "I was flying to New York and Air France said it was a mechanical issue.",
      first.facts,
      { llmClient: null }
    );

    expect(second.status).toBe("ready");
    expect(second.facts.destination.country).toBe("United States");
    expect(second.facts.disruptionReason).toBe("mechanical");
  });

  it("separates a cancellation incident from an unresolved controllability reason", async () => {
    const result = await processIntake(
      "United cancelled my flight because the plane arrived late.",
      emptyClaimFacts(),
      { llmClient: null }
    );

    expect(result.facts.disruptionReason).toBe("late_inbound_aircraft");
    expect(result.facts.issueType).toBe("airline_cancellation");
  });

  it("asks a hotel-specific provider question for a Chinese walk report", async () => {
    const result = await processIntake("我订了酒店但是到店无房", emptyClaimFacts(), {
      llmClient: null
    });

    expect(result.facts.issueType).toBe("hotel_walk");
    expect(result.missingFields).toEqual(["provider"]);
    expect(result.question).toBe("是哪家酒店或酒店集团？");
  });
});

describe("LLM intake", () => {
  it("uses validated structured model output when a client is configured", async () => {
    const llmFacts = {
      set: {
        incidentType: "hotel_walk",
        providerType: "hotel",
        provider: "Marriott",
        confirmedHotelReservation: true,
        wasWalked: true
      }
    };
    const client: StructuredOutputClient = {
      generate: vi.fn().mockResolvedValue(llmFacts)
    };

    const result = await processIntake("酒店说超售没房", emptyClaimFacts(), {
      llmClient: client
    });

    expect(result.status).toBe("ready");
    expect(result.extractionMode).toBe("llm");
    expect(result.facts.provider).toBe("Marriott");
  });

  it("normalizes a Chinese Marriott name returned by the model", async () => {
    const client: StructuredOutputClient = {
      generate: vi.fn().mockResolvedValue({
        set: {
          incidentType: "hotel_walk",
          providerType: "hotel",
          provider: "万豪酒店",
          confirmedHotelReservation: true,
          wasWalked: true
        }
      })
    };

    const result = await processIntake("酒店说超售没房", emptyClaimFacts(), {
      llmClient: client
    });

    expect(result.status).toBe("ready");
    expect(result.extractionMode).toBe("llm");
    expect(result.facts.provider).toBe("Marriott");
  });

  it("falls back safely when model output is invalid", async () => {
    const client: StructuredOutputClient = {
      generate: vi.fn().mockResolvedValue({ set: { issueType: "invented_type" } })
    };

    const result = await processIntake(
      "United cancelled my flight because the crew timed out.",
      emptyClaimFacts(),
      { llmClient: client }
    );

    expect(result.extractionMode).toBe("deterministic");
    expect(result.warning).toBe("llm_fallback_used");
    expect(result.facts.issueType).toBe("airline_cancellation");
  });

  it("does not repeat questions for explicit facts omitted by valid model output", async () => {
    const incompleteModelFacts = {
      set: {
        incidentType: "airline_cancellation",
        providerType: "airline",
        provider: "Air France",
        "origin.city": "Paris",
        "origin.country": "France",
        "destination.city": "New York",
        "destination.country": "United States"
      }
    };
    const client: StructuredOutputClient = {
      generate: vi.fn().mockResolvedValue(incompleteModelFacts)
    };

    const first = await processIntake(
      "My Air France flight from Paris was cancelled. I was rerouted and arrived at my final destination four hours late.",
      emptyClaimFacts(),
      { llmClient: client }
    );

    expect(first.facts.arrivalDelayMinutes).toBe(240);
    expect(first.facts.issueType).toBe("airline_cancellation");
    expect(first.missingFields).toEqual(["disruptionReason"]);
    expect(first.question).toBe("What reason did the airline give?");

    const second = await processIntake(
      "like four hours and it is because the plane arrived late",
      first.facts,
      { llmClient: client }
    );

    expect(second.facts.arrivalDelayMinutes).toBe(240);
    expect(second.facts.disruptionReason).toBe("late_inbound_aircraft");
    expect(second.status).toBe("ready");
    expect(second.question).toBeNull();
  });
});

describe("OpenAI Responses client", () => {
  it("requests strict JSON Schema output without storing the response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [{ type: "output_text", text: JSON.stringify(emptyClaimFacts()) }]
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = new OpenAIResponsesClient({
      apiKey: "test-key",
      model: "test-model",
      fetcher
    });

    await client.generate({
      schemaName: "test_schema",
      schema: { type: "object" },
      instructions: "Extract facts.",
      input: "Example"
    });

    const request = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(request.model).toBe("test-model");
    expect(request.store).toBe(false);
    expect(request.reasoning).toEqual({ effort: "none" });
    expect(request.text.format).toMatchObject({
      type: "json_schema",
      name: "test_schema",
      strict: true
    });
  });
});

describe("DeepSeek Chat Completions client", () => {
  it("uses DeepSeek JSON mode and parses the assistant message", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify(emptyClaimFacts())
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = new DeepSeekChatCompletionsClient({
      apiKey: "test-key",
      model: "deepseek-v4",
      baseUrl: "https://api.deepseek.com/",
      fetcher
    });

    const result = await client.generate({
      schemaName: "claim_facts",
      schema: { type: "object", required: ["issueType"] },
      instructions: "Extract facts.",
      input: "Example"
    });

    expect(result).toEqual(emptyClaimFacts());
    expect(fetcher.mock.calls[0][0]).toBe("https://api.deepseek.com/chat/completions");

    const request = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(request.model).toBe("deepseek-v4-flash");
    expect(request.messages).toEqual([
      {
        role: "system",
        content: expect.stringContaining("valid JSON matching this JSON Schema")
      },
      { role: "user", content: "Example" }
    ]);
    expect(request.thinking).toEqual({ type: "disabled" });
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request).not.toHaveProperty("text");
    expect(request).not.toHaveProperty("input");
  });

  it("rejects truncated structured output", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "length",
              message: { role: "assistant", content: "{}" }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = new DeepSeekChatCompletionsClient({ apiKey: "test-key", fetcher });

    await expect(
      client.generate({
        schemaName: "claim_facts",
        schema: { type: "object" },
        instructions: "Extract facts.",
        input: "Example"
      })
    ).rejects.toThrow("truncated");
  });
});

describe("LLM provider configuration", () => {
  it("recognizes the existing OpenAI-compatible DeepSeek environment", () => {
    const env = {
      OPENAI_API_KEY: "test-key",
      OPENAI_INTAKE_MODEL: "deepseek-v4",
      OPENAI_BASE_URL: "https://api.deepseek.com/"
    };

    expect(resolveLlmProvider(env)).toBe("deepseek");
    expect(createStructuredOutputClientFromEnv(env)).toBeInstanceOf(DeepSeekChatCompletionsClient);
  });

  it("respects an explicit OpenAI provider", () => {
    const env = {
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key",
      OPENAI_INTAKE_MODEL: "test-model"
    };

    expect(resolveLlmProvider(env)).toBe("openai");
    expect(createStructuredOutputClientFromEnv(env)).toBeInstanceOf(OpenAIResponsesClient);
  });
});

describe("intake API", () => {
  it("returns a conversational follow-up with accumulated facts", async () => {
    const request = new Request("http://localhost/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "My Air France flight from Paris was cancelled and I arrived four hours late.",
        facts: null
      })
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.status).toBe("needs_info");
    expect(result.question).toBe(
      "Where did the flight fly to? A city name or airport code is enough."
    );
  });
});

describe("canonical revision-safe intake", () => {
  const validProviderConflict = {
    field: "provider",
    candidates: [
      { value: "Delta", source: "deterministic_extraction" },
      { value: "Air France", source: "openai_extraction" }
    ]
  };

  it.each([
    ["stale base revision", { message: "new facts", prior: claimState({}, 2), baseRevision: 1 }],
    [
      "message plus correction",
      {
        message: "new facts",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: [] }
      }
    ],
    ["blank message", { message: "", prior: claimState(), baseRevision: 0 }],
    [
      "whitespace correction message",
      {
        message: "  ",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: [] }
      }
    ],
    [
      "empty correction",
      {
        message: "",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: {}, clear: [] }
      }
    ],
    [
      "null correction set",
      {
        message: "",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: { provider: null }, clear: [] }
      }
    ],
    [
      "duplicate clear",
      {
        message: "",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: {}, clear: ["provider", "provider"] }
      }
    ],
    [
      "unknown clear",
      {
        message: "",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: {}, clear: ["origin.region"] }
      }
    ],
    [
      "set-clear overlap",
      {
        message: "",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: ["provider"] }
      }
    ],
    [
      "untrusted provenance source",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          provenance: { provider: { source: "client_asserted", factsRevision: 0 } }
        },
        baseRevision: 0
      }
    ],
    [
      "untrusted conflict source",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          conflicts: [
            {
              field: "provider",
              candidates: [{ value: "Delta", source: "user_correction" }]
            }
          ]
        },
        baseRevision: 0
      }
    ],
    [
      "untrusted unresolved path",
      {
        message: "new facts",
        prior: { ...claimState(), unresolvedFields: ["origin.region"] },
        baseRevision: 0
      }
    ],
    [
      "duplicate conflict fields",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          conflicts: [validProviderConflict, structuredClone(validProviderConflict)],
          unresolvedFields: ["provider"]
        },
        baseRevision: 0
      }
    ],
    [
      "a conflict with one candidate",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          conflicts: [
            {
              field: "provider",
              candidates: [{ value: "Delta", source: "deterministic_extraction" }]
            }
          ],
          unresolvedFields: ["provider"]
        },
        baseRevision: 0
      }
    ],
    [
      "a conflict with duplicate candidate sources",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          conflicts: [
            {
              field: "provider",
              candidates: [
                { value: "Delta", source: "deterministic_extraction" },
                { value: "Air France", source: "deterministic_extraction" }
              ]
            }
          ],
          unresolvedFields: ["provider"]
        },
        baseRevision: 0
      }
    ],
    [
      "a conflict with equal normalized values",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          conflicts: [
            {
              field: "provider",
              candidates: [
                { value: "Delta", source: "deterministic_extraction" },
                { value: " Delta ", source: "openai_extraction" }
              ]
            }
          ],
          unresolvedFields: ["provider"]
        },
        baseRevision: 0
      }
    ],
    [
      "a conflict missing its unresolved marker",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          conflicts: [validProviderConflict],
          unresolvedFields: []
        },
        baseRevision: 0
      }
    ]
  ])("rejects %s", (_label, request) => {
    expect(parseAnalyzeClaimRequest(request).success).toBe(false);
  });

  it.each([
    [
      "duplicate conflict fields",
      {
        ...claimState(),
        conflicts: [validProviderConflict, structuredClone(validProviderConflict)],
        unresolvedFields: ["provider"]
      }
    ],
    [
      "invalid candidate cardinality",
      {
        ...claimState(),
        conflicts: [
          {
            field: "provider",
            candidates: [{ value: "Delta", source: "deterministic_extraction" }]
          }
        ],
        unresolvedFields: ["provider"]
      }
    ],
    [
      "conflict not marked unresolved",
      {
        ...claimState(),
        conflicts: [validProviderConflict],
        unresolvedFields: []
      }
    ]
  ])("rejects route state with %s before extraction", async (_label, prior) => {
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    const openaiExtractor: RawFactExtractor = {
      provider: "openai",
      model: "gpt-5.6-luna",
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    const handler = createIntakePostHandler({ localExtractor, openaiExtractor });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({ message: "new facts", prior, baseRevision: 0 })
      })
    );

    expect(response.status).toBe(400);
    expect(localExtractor.extract).not.toHaveBeenCalled();
    expect(openaiExtractor.extract).not.toHaveBeenCalled();
  });

  it("rejects malformed state before calling either extractor", async () => {
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    const openaiExtractor: RawFactExtractor = {
      provider: "openai",
      model: "gpt-5.6-luna",
      extract: vi.fn().mockResolvedValue({ set: {} })
    };

    await expect(
      processClaimTurn(
        {
          message: "new facts",
          prior: {
            ...claimState(),
            provenance: { "origin.region": { source: "user_message", factsRevision: 0 } }
          },
          baseRevision: 0
        },
        { localExtractor, openaiExtractor }
      )
    ).rejects.toThrow("invalid_analyze_claim_request");
    expect(localExtractor.extract).not.toHaveBeenCalled();
    expect(openaiExtractor.extract).not.toHaveBeenCalled();
  });

  it.each([
    [
      "an unresolved mask without a conflict",
      claimState(
        {
          incidentType: "denied_boarding",
          origin: { airport: "JFK" },
          deniedBoardingKind: "voluntary"
        },
        0,
        { unresolvedFields: ["deniedBoardingKind"] }
      )
    ],
    [
      "a valid stored conflict",
      claimState(
        {
          incidentType: "denied_boarding",
          origin: { airport: "JFK" },
          provider: "Delta"
        },
        0,
        {
          conflicts: [validProviderConflict as never],
          unresolvedFields: ["provider"]
        }
      )
    ]
  ])(
    "returns needs_information for %s even when scenario admission resolves",
    async (_label, prior) => {
      const response = await processClaimTurn(
        { message: "No new material fact.", prior, baseRevision: 0, requestedMode: "local" },
        {
          localExtractor: {
            provider: "local",
            model: null,
            extract: vi.fn().mockResolvedValue({ set: {} })
          }
        }
      );

      expect(response.status).toBe("needs_information");
    }
  );

  it.each([
    [undefined, 0],
    ["local", 0],
    ["gpt", 1]
  ] as const)("calls OpenAI only for requestedMode %s", async (requestedMode, openaiCalls) => {
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    const openaiExtractor: RawFactExtractor = {
      provider: "openai",
      model: "gpt-5.6-luna",
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    await processClaimTurn(
      {
        message: "No new material fact.",
        prior: claimState(),
        baseRevision: 0,
        ...(requestedMode ? { requestedMode } : {})
      },
      { localExtractor, openaiExtractor }
    );

    expect(localExtractor.extract).toHaveBeenCalledOnce();
    expect(openaiExtractor.extract).toHaveBeenCalledTimes(openaiCalls);
  });

  it("preserves a nonblank message exactly in the parsed contract", () => {
    const message = "  Keep this spacing and punctuation!  ";
    const parsed = parseAnalyzeClaimRequest({ message, prior: claimState(), baseRevision: 0 });

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error(parsed.errors.join("; "));
    expect(parsed.data.message).toBe(message);
  });

  it("passes the exact nonblank message to extractors", async () => {
    const message = "  Keep this spacing and punctuation!  ";
    const extract = vi.fn().mockResolvedValue({ set: {} });

    await processClaimTurn(
      { message, prior: claimState(), baseRevision: 0, requestedMode: "local" },
      { localExtractor: { provider: "local", model: null, extract } }
    );

    expect(extract).toHaveBeenCalledWith(expect.objectContaining({ message }));
  });

  it("masks a legacy dual-extractor conflict instead of projecting the old value as ready", async () => {
    const currentFacts = normalizeClaimFacts({
      ...emptyClaimFacts(),
      issueType: "denied_boarding",
      providerType: "airline",
      provider: "Delta",
      origin: { city: null, airport: "JFK", country: "United States", region: "US" },
      disruptionType: "denied_boarding",
      deniedBoardingKind: "voluntary",
      confidence: "high"
    });
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: { deniedBoardingKind: "voluntary" } })
    };
    const openaiExtractor: RawFactExtractor = {
      provider: "openai",
      model: "gpt-5.6-luna",
      extract: vi.fn().mockResolvedValue({ set: { deniedBoardingKind: "involuntary" } })
    };

    const result = await processIntake("I was bumped.", currentFacts, {
      localExtractor,
      openaiExtractor
    });

    expect(result.status).toBe("needs_info");
    expect(result.facts.deniedBoardingKind).toBe("unknown");
    expect(result.missingFields).toContain("deniedBoardingKind");
  });

  it("asks a generic legacy question when an unresolved field is not a legacy missing field", async () => {
    const currentFacts = normalizeClaimFacts({
      ...emptyClaimFacts(),
      issueType: "hotel_walk",
      providerType: "hotel",
      provider: "Marriott",
      loyaltyStatus: "Titanium",
      confidence: "high"
    });
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: { loyaltyStatus: "Gold" } })
    };
    const openaiExtractor: RawFactExtractor = {
      provider: "openai",
      model: "gpt-5.6-luna",
      extract: vi.fn().mockResolvedValue({ set: { loyaltyStatus: "Platinum" } })
    };

    const result = await processIntake("My status changed.", currentFacts, {
      localExtractor,
      openaiExtractor
    });

    expect(result.status).toBe("needs_info");
    expect(result.missingFields).toEqual([]);
    expect(result.question).toBe("Please add a little more detail about what happened.");
  });

  it("runs a stateless two-turn correction without replaying narrative or extractors", async () => {
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({
        set: {
          incidentType: "denied_boarding",
          "origin.airport": "JFK",
          deniedBoardingKind: "voluntary"
        }
      })
    };
    const openaiExtractor: RawFactExtractor = {
      provider: "openai",
      model: "gpt-5.6-luna",
      extract: vi.fn().mockResolvedValue({
        set: {
          incidentType: "denied_boarding",
          "origin.airport": "JFK",
          deniedBoardingKind: "voluntary"
        }
      })
    };
    const handler = createIntakePostHandler({ localExtractor, openaiExtractor });

    const firstResponse = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({
          message: "My original anonymous denied-boarding narrative.",
          prior: claimState(),
          baseRevision: 0,
          requestedMode: "gpt"
        })
      })
    );
    const first = await firstResponse.json();
    const secondResponse = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({
          message: "",
          prior: first.claimState,
          baseRevision: first.claimState.revision,
          correction: { set: { deniedBoardingKind: "involuntary" }, clear: [] },
          requestedMode: "gpt"
        })
      })
    );
    const second = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(localExtractor.extract).toHaveBeenCalledTimes(1);
    expect(openaiExtractor.extract).toHaveBeenCalledTimes(1);
    expect(first.baseRevision).toBe(0);
    expect(first.claimState.revision).toBe(1);
    expect(second.baseRevision).toBe(1);
    expect(second.claimState.revision).toBe(2);
    expect(second.claimState.facts.deniedBoardingKind).toBe("involuntary");
    expect(JSON.stringify(first)).not.toContain("original anonymous denied-boarding narrative");
    expect(JSON.stringify(second)).not.toContain("original anonymous denied-boarding narrative");
  });

  it("never selects DeepSeek or any external model in the public handler", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "configured-but-must-not-be-used");
    vi.stubEnv("LLM_PROVIDER", "deepseek");
    const fetcher = vi.spyOn(globalThis, "fetch");

    const response = await POST(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({
          message: "My flight was delayed by 20 minutes.",
          prior: claimState(),
          baseRevision: 0,
          requestedMode: "gpt"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps malformed canonical-shaped requests out of the legacy branch", async () => {
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    const handler = createIntakePostHandler({ localExtractor });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({
          message: "new facts",
          prior: claimState(),
          facts: null
        })
      })
    );

    expect(response.status).toBe(400);
    expect(localExtractor.extract).not.toHaveBeenCalled();
  });

  it("returns a fixed safe 400 for canonical parse failures", async () => {
    const handler = createIntakePostHandler({
      localExtractor: {
        provider: "local",
        model: null,
        extract: vi.fn().mockResolvedValue({ set: {} })
      }
    });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({ message: "new facts", prior: claimState() })
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid canonical intake request." });
  });

  it("returns a fixed safe 500 without leaking canonical extractor errors", async () => {
    const handler = createIntakePostHandler({
      localExtractor: {
        provider: "local",
        model: null,
        extract: vi.fn().mockRejectedValue(new Error("private upstream response"))
      }
    });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({
          message: "new facts",
          prior: claimState(),
          baseRevision: 0,
          requestedMode: "local"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Intake processing failed." });
    expect(JSON.stringify(body)).not.toContain("private upstream response");
  });

  it("returns a fixed safe 500 without leaking legacy extractor errors", async () => {
    const handler = createIntakePostHandler({
      localExtractor: {
        provider: "local",
        model: null,
        extract: vi.fn().mockRejectedValue(new Error("private legacy detail"))
      }
    });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({ message: "new facts", facts: null })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Intake processing failed." });
    expect(JSON.stringify(body)).not.toContain("private legacy detail");
  });

  it("returns a fixed safe 400 for invalid legacy facts", async () => {
    const handler = createIntakePostHandler({
      localExtractor: {
        provider: "local",
        model: null,
        extract: vi.fn().mockResolvedValue({ set: {} })
      }
    });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({ message: "new facts", facts: {} })
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid existing claim facts." });
  });
});
