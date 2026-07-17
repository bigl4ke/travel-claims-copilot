export type StructuredOutputRequest = {
  schemaName: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: string;
};

export interface StructuredOutputClient {
  generate<T>(request: StructuredOutputRequest): Promise<T>;
}

type Fetcher = typeof fetch;
export type LlmProvider = "openai" | "deepseek";
export type LlmEnvironment = Record<string, string | undefined>;

export type OpenAIResponsesClientOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetcher?: Fetcher;
};

export type DeepSeekChatCompletionsClientOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetcher?: Fetcher;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractResponseText(payload: unknown): string | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.output)) {
    return undefined;
  }

  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return undefined;
}

function extractDeepSeekMessage(payload: unknown): string | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return undefined;
  }

  for (const choice of payload.choices) {
    if (!isRecord(choice)) {
      continue;
    }
    if (choice.finish_reason === "length") {
      throw new Error("DeepSeek Chat Completions API truncated the structured output");
    }
    if (
      isRecord(choice.message) &&
      typeof choice.message.content === "string" &&
      choice.message.content.trim()
    ) {
      return choice.message.content;
    }
  }

  return undefined;
}

function normalizeDeepSeekModel(model: string | undefined): string {
  const normalized = model?.trim();
  // The initial V4 release uses tiered API identifiers rather than a bare alias.
  return normalized === "deepseek-v4"
    ? "deepseek-v4-flash"
    : normalized || "deepseek-v4-flash";
}

export class OpenAIResponsesClient implements StructuredOutputClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetcher: Fetcher;

  constructor(options: OpenAIResponsesClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-5.6-luna";
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async generate<T>(request: StructuredOutputRequest): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          reasoning: { effort: "none" },
          store: false,
          instructions: request.instructions,
          input: request.input,
          text: {
            verbosity: "low",
            format: {
              type: "json_schema",
              name: request.schemaName,
              strict: true,
              schema: request.schema
            }
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`OpenAI Responses API returned HTTP ${response.status}`);
      }

      const text = extractResponseText(await response.json());
      if (!text) {
        throw new Error("OpenAI Responses API returned no structured output text");
      }

      return JSON.parse(text) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class DeepSeekChatCompletionsClient implements StructuredOutputClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetcher: Fetcher;

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

export function createOpenAIClientFromEnv(
  env: LlmEnvironment = process.env
): OpenAIResponsesClient | undefined {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }

  return new OpenAIResponsesClient({
    apiKey,
    model: env.OPENAI_INTAKE_MODEL?.trim() || "gpt-5.6-luna",
    baseUrl: env.OPENAI_BASE_URL?.trim() || undefined
  });
}

export function createDeepSeekClientFromEnv(
  env: LlmEnvironment = process.env
): DeepSeekChatCompletionsClient | undefined {
  // Accept the old OPENAI_* gateway convention so existing local setups keep working.
  const dedicatedApiKey = env.DEEPSEEK_API_KEY?.trim();
  const apiKey = dedicatedApiKey || env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }

  return new DeepSeekChatCompletionsClient({
    apiKey,
    model:
      env.DEEPSEEK_INTAKE_MODEL?.trim() ||
      (!dedicatedApiKey ? env.OPENAI_INTAKE_MODEL?.trim() : undefined),
    baseUrl:
      env.DEEPSEEK_BASE_URL?.trim() ||
      (!dedicatedApiKey ? env.OPENAI_BASE_URL?.trim() : undefined)
  });
}

export function resolveLlmProvider(
  env: LlmEnvironment = process.env
): LlmProvider | undefined {
  const explicitProvider = env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicitProvider === "openai" || explicitProvider === "deepseek") {
    return explicitProvider;
  }
  if (explicitProvider) {
    return undefined;
  }

  const model = (
    env.DEEPSEEK_INTAKE_MODEL?.trim() || env.OPENAI_INTAKE_MODEL?.trim() || ""
  ).toLowerCase();
  const baseUrl = (
    env.DEEPSEEK_BASE_URL?.trim() || env.OPENAI_BASE_URL?.trim() || ""
  ).toLowerCase();

  if (
    env.DEEPSEEK_API_KEY?.trim() ||
    model.startsWith("deepseek-") ||
    baseUrl.includes("api.deepseek.com")
  ) {
    return "deepseek";
  }

  return env.OPENAI_API_KEY?.trim() ? "openai" : undefined;
}

export function createStructuredOutputClientFromEnv(
  env: LlmEnvironment = process.env
): StructuredOutputClient | undefined {
  const provider = resolveLlmProvider(env);
  if (provider === "deepseek") {
    return createDeepSeekClientFromEnv(env);
  }
  if (provider === "openai") {
    return createOpenAIClientFromEnv(env);
  }
  return undefined;
}
