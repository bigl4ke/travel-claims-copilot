import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

// @ts-expect-error The JavaScript runner has no declaration file.
import * as offlineNextRunner from "../../scripts/run-offline-next.mjs";

const { MODEL_ENV_KEYS, createOfflineEnv, createOfflineNextInvocation } = offlineNextRunner;

const expectedModelEnvKeys = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_INTAKE_MODEL",
  "OPENAI_ORG_ID",
  "OPENAI_PROJECT_ID",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_INTAKE_MODEL",
  "LLM_PROVIDER"
] as const;
const offlineSentinel = ["offline", "sentinel"].join("-");

describe("offline Next runner", () => {
  it("removes every model setting and replaces inherited Node options", () => {
    const parentEnv = Object.fromEntries([
      ...expectedModelEnvKeys.map((key) => [key, `offline-sentinel-${key}`]),
      ["NODE_OPTIONS", "--require=untrusted-parent-hook"],
      ["PATH", "/synthetic/path"]
    ]);
    const invocation = createOfflineNextInvocation("build", parentEnv);
    const { env } = invocation.options;
    const guardUrl = pathToFileURL(
      path.join(process.cwd(), "scripts", "offline-network-guard.mjs")
    ).href;

    expectedModelEnvKeys.forEach((key) => expect(env).not.toHaveProperty(key));
    expect(env).toMatchObject({
      PATH: "/synthetic/path",
      NEXT_TELEMETRY_DISABLED: "1",
      TEST_OFFLINE: "1",
      NODE_OPTIONS: `--import=${guardUrl}`
    });
    expect(env).toEqual(createOfflineEnv(parentEnv));
  });

  it.each(["dev", "build"] as const)("creates a shell-free %s invocation", (mode) => {
    const invocation = createOfflineNextInvocation(mode, { OPENAI_API_KEY: offlineSentinel });

    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args).toEqual([
      path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
      mode
    ]);
    expect(invocation.options).toMatchObject({
      cwd: process.cwd(),
      stdio: "inherit",
      shell: false
    });
    expect(invocation.options.env).not.toHaveProperty("OPENAI_API_KEY");
  });

  it.each(["start", "test", "", undefined])("rejects unsupported mode %s", (mode) => {
    expect(() => createOfflineNextInvocation(mode as never)).toThrow(
      `Unsupported offline Next mode: ${String(mode)}`
    );
  });

  it("keeps the model environment inventory synchronized with code and the example file", () => {
    const sources = ["lib/llm.ts", "lib/deepseek-chat-completions-client.ts", ".env.example"]
      .map((file) => readFileSync(path.join(process.cwd(), file), "utf8"))
      .join("\n");
    const discovered = new Set(
      sources.match(/\b(?:OPENAI|DEEPSEEK)_[A-Z0-9_]+\b|\bLLM_PROVIDER\b/g) ?? []
    );

    expect(MODEL_ENV_KEYS).toEqual(expectedModelEnvKeys);
    expect([...discovered].filter((key) => !MODEL_ENV_KEYS.includes(key)).sort()).toEqual([]);
  });
});
