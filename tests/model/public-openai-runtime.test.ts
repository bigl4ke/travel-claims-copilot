import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDeepSeekClientFromEnv,
  createPublicOpenAIClientFromEnv,
  DeepSeekChatCompletionsClient,
  type StructuredOutputRequest
} from "../../lib/llm";

const structuredRequest: StructuredOutputRequest = {
  schemaName: "raw_fact_patch",
  schema: { type: "object" },
  instructions: "Return a sparse patch.",
  input: "A bounded offline fixture.",
  maxOutputTokens: 1_200
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public OpenAI runtime", () => {
  it("pins the official URL and Luna model despite mixed compatibility configuration", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ content: [{ type: "output_text", text: '{"set":{}}' }] }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetcher);
    const client = createPublicOpenAIClientFromEnv({
      OPENAI_API_KEY: "synthetic-public-openai-key",
      LLM_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "synthetic-deepseek-key-marker",
      DEEPSEEK_INTAKE_MODEL: "deepseek-model-marker",
      DEEPSEEK_BASE_URL: "https://deepseek-base-marker.example/v1",
      OPENAI_INTAKE_MODEL: "custom-openai-model-marker",
      OPENAI_BASE_URL: "https://custom-openai-base-marker.example/v9"
    });
    expect(client).toBeDefined();

    await client?.generate(structuredRequest);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer synthetic-public-openai-key",
      "Content-Type": "application/json"
    });
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "gpt-5.6-luna", store: false, max_output_tokens: 1_200 });
    const outbound = JSON.stringify({ url, headers: init.headers, body });
    expect(outbound).not.toContain("deepseek");
    expect(outbound).not.toContain("custom-openai");
  });

  it.each([undefined, "", "   "])("returns undefined without a non-empty OpenAI key", (apiKey) => {
    expect(createPublicOpenAIClientFromEnv({ OPENAI_API_KEY: apiKey })).toBeUndefined();
  });

  it("keeps the generic DeepSeek compatibility factory importable without making a request", () => {
    const client = createDeepSeekClientFromEnv({
      DEEPSEEK_API_KEY: "synthetic-offline-deepseek-key",
      DEEPSEEK_INTAKE_MODEL: "deepseek-chat",
      DEEPSEEK_BASE_URL: "https://api.deepseek.com"
    });

    expect(client).toBeInstanceOf(DeepSeekChatCompletionsClient);
  });
});
