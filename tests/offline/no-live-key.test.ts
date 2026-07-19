import { describe, expect, it, vi } from "vitest";

import {
  DeepSeekChatCompletionsClient,
  OpenAIResponsesClient,
  type StructuredOutputRequest
} from "../../lib/llm";

const request: StructuredOutputRequest = {
  schemaName: "offline_probe",
  schema: { type: "object" },
  instructions: "Return an empty object.",
  input: "Synthetic offline input.",
  maxOutputTokens: 1_200
};
const offlineSentinel = ["offline", "sentinel"].join("-");

describe("model adapter offline backstop", () => {
  it.each([
    [
      "OpenAI",
      (fetcher: typeof fetch) => new OpenAIResponsesClient({ apiKey: offlineSentinel, fetcher })
    ],
    [
      "DeepSeek",
      (fetcher: typeof fetch) =>
        new DeepSeekChatCompletionsClient({ apiKey: offlineSentinel, fetcher })
    ]
  ] as const)(
    "blocks %s before its injected fetcher is called",
    async (_provider, createClient) => {
      vi.stubEnv("TEST_OFFLINE", "1");
      vi.stubEnv("OPENAI_API_KEY", offlineSentinel);
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ output: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
      const client = createClient(fetcher);

      await expect(client.generate(request)).rejects.toThrow(
        "External model calls are disabled in TEST_OFFLINE"
      );
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
});
