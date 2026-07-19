import { afterEach, beforeEach, vi } from "vitest";

const originalFetch = globalThis.fetch;
const modelEnvKeys = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_INTAKE_MODEL",
  "OPENAI_ORG_ID",
  "OPENAI_PROJECT_ID",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_INTAKE_MODEL",
  "LLM_PROVIDER",
  "DEMO_ACCESS_CODE"
] as const;

export function assertOfflineUrl(input: string | URL | Request): void {
  const raw = input instanceof Request ? input.url : input.toString();
  const url = new URL(raw);
  if (
    !/^127(?:\.\d{1,3}){3}$/.test(url.hostname) &&
    url.hostname !== "localhost" &&
    url.hostname !== "[::1]"
  ) {
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
