import { afterEach, beforeEach, vi } from "vitest";

const originalFetch = globalThis.fetch;
const modelEnvKeys = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_INTAKE_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_INTAKE_MODEL",
  "LLM_PROVIDER"
] as const;

export function assertOfflineUrl(input: string | URL | Request): void {
  const raw = input instanceof Request ? input.url : input.toString();
  const url = new URL(raw);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(`Offline test blocked non-loopback request to ${url.origin}`);
  }
}

beforeEach(() => {
  modelEnvKeys.forEach((key) => vi.stubEnv(key, ""));
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assertOfflineUrl(input);
    return originalFetch(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
