import type {
  DeepSeekChatCompletionsClientOptions,
  StructuredOutputClient,
  StructuredOutputRequest
} from "./llm";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractDeepSeekMessage(payload: unknown): string | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return undefined;
  }

  const choice = payload.choices.find((candidate) => {
    if (!isRecord(candidate)) {
      return false;
    }
    if (candidate.finish_reason === "length") {
      throw new Error("DeepSeek Chat Completions API truncated the structured output");
    }
    return (
      isRecord(candidate.message) &&
      typeof candidate.message.content === "string" &&
      Boolean(candidate.message.content.trim())
    );
  });

  return isRecord(choice) && isRecord(choice.message)
    ? (choice.message.content as string)
    : undefined;
}

function normalizeDeepSeekModel(model: string | undefined): string {
  const normalized = model?.trim();
  // The initial V4 release uses tiered API identifiers rather than a bare alias.
  return normalized === "deepseek-v4" ? "deepseek-v4-flash" : normalized || "deepseek-v4-flash";
}

export class DeepSeekChatCompletionsClient implements StructuredOutputClient {
  private readonly apiKey: string;

  private readonly model: string;

  private readonly baseUrl: string;

  private readonly timeoutMs: number;

  private readonly fetcher: typeof fetch;

  constructor(options: DeepSeekChatCompletionsClientOptions) {
    this.apiKey = options.apiKey;
    this.model = normalizeDeepSeekModel(options.model);
    this.baseUrl = (options.baseUrl ?? "https://api.deepseek.com").replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async generate<T>(request: StructuredOutputRequest): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const systemPrompt = [
      request.instructions,
      "Return only valid JSON matching this JSON Schema exactly:",
      JSON.stringify(request.schema)
    ].join("\n\n");

    try {
      const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: request.input }
          ],
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          stream: false
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`DeepSeek Chat Completions API returned HTTP ${response.status}`);
      }

      const content = extractDeepSeekMessage(await response.json());
      if (!content) {
        throw new Error("DeepSeek Chat Completions API returned no structured output text");
      }

      return JSON.parse(content) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
