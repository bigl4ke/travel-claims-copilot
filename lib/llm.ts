import { DeepSeekChatCompletionsClient } from "./deepseek-chat-completions-client";
import { INPUT_LIMITS } from "./api/input-limits";
import { classifyModelFailure, ModelFailure } from "./model/model-error";
import { assertExternalModelCallAllowed } from "./external-model-call-policy";

export { DeepSeekChatCompletionsClient } from "./deepseek-chat-completions-client";
export { assertExternalModelCallAllowed } from "./external-model-call-policy";

export type StructuredOutputRequest = {
  schemaName: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: string;
  maxOutputTokens: number;
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

  const content = payload.output
    .flatMap((item) => (isRecord(item) && Array.isArray(item.content) ? item.content : []))
    .find((item) => isRecord(item) && item.type === "output_text" && typeof item.text === "string");

  return isRecord(content) ? (content.text as string) : undefined;
}

function hasResponseRefusal(payload: unknown): boolean {
  if (!isRecord(payload) || !Array.isArray(payload.output)) return false;
  return payload.output.some(
    (item) =>
      isRecord(item) &&
      Array.isArray(item.content) &&
      item.content.some((content) => isRecord(content) && content.type === "refusal")
  );
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
    assertExternalModelCallAllowed();
    if (request.maxOutputTokens !== INPUT_LIMITS.modelOutputTokens) {
      throw new Error("invalid_model_output_token_limit");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let response: Response;
      try {
        response = await this.fetcher(`${this.baseUrl}/responses`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: this.model,
            reasoning: { effort: "none" },
            store: false,
            max_output_tokens: request.maxOutputTokens,
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
      } catch (error) {
        throw classifyModelFailure(error) ?? error;
      }

      if (!response.ok) {
        throw (
          classifyModelFailure({ status: response.status }) ?? new Error("openai_request_failed")
        );
      }

      let payload: unknown;
      try {
        payload = (await response.json()) as unknown;
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new ModelFailure("invalid_model_json", true, true);
        }
        throw error;
      }
      if (hasResponseRefusal(payload)) {
        throw new ModelFailure("model_refusal", false, false);
      }
      const text = extractResponseText(payload);
      if (!text) {
        throw new ModelFailure("invalid_model_schema", true, true);
      }
      if (new TextEncoder().encode(text).byteLength > INPUT_LIMITS.modelOutputBytes) {
        throw new ModelFailure("invalid_model_schema", true, true);
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ModelFailure("invalid_model_json", true, true);
      }
    } catch (error) {
      throw classifyModelFailure(error) ?? error;
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

/** Public routes use only this pinned official OpenAI factory. */
export function createPublicOpenAIClientFromEnv(
  env: LlmEnvironment = process.env
): OpenAIResponsesClient | undefined {
  const apiKey = env.OPENAI_API_KEY?.trim();
  return apiKey ? new OpenAIResponsesClient({ apiKey, model: "gpt-5.6-luna" }) : undefined;
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
      env.DEEPSEEK_BASE_URL?.trim() || (!dedicatedApiKey ? env.OPENAI_BASE_URL?.trim() : undefined)
  });
}

export function resolveLlmProvider(env: LlmEnvironment = process.env): LlmProvider | undefined {
  const explicitProvider = env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicitProvider === "openai" || explicitProvider === "deepseek") {
    return explicitProvider;
  }
  if (explicitProvider) {
    return undefined;
  }

  const model = (
    env.DEEPSEEK_INTAKE_MODEL?.trim() ||
    env.OPENAI_INTAKE_MODEL?.trim() ||
    ""
  ).toLowerCase();
  const baseUrl = (
    env.DEEPSEEK_BASE_URL?.trim() ||
    env.OPENAI_BASE_URL?.trim() ||
    ""
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
