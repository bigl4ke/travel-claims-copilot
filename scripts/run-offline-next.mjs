import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MODEL_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_INTAKE_MODEL",
  "OPENAI_ORG_ID",
  "OPENAI_PROJECT_ID",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_INTAKE_MODEL",
  "LLM_PROVIDER"
];

const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const offlineGuardUrl = new URL("./offline-network-guard.mjs", import.meta.url);

export function createOfflineEnv(parentEnv = process.env) {
  const env = { ...parentEnv };
  MODEL_ENV_KEYS.forEach((key) => delete env[key]);
  env.NEXT_TELEMETRY_DISABLED = "1";
  env.TEST_OFFLINE = "1";
  env.NODE_OPTIONS = `--import=${offlineGuardUrl.href}`;
  return env;
}

export function createOfflineNextInvocation(mode, parentEnv = process.env) {
  if (mode !== "dev" && mode !== "build") {
    throw new Error(`Unsupported offline Next mode: ${mode}`);
  }
  return {
    command: process.execPath,
    args: [nextBin, mode],
    options: {
      cwd: process.cwd(),
      env: createOfflineEnv(parentEnv),
      stdio: "inherit",
      shell: false
    }
  };
}

export async function runOfflineNext(mode) {
  const invocation = createOfflineNextInvocation(mode);
  const child = spawn(invocation.command, invocation.args, invocation.options);
  const signals = ["SIGINT", "SIGTERM"];
  const handlers = new Map(signals.map((signal) => [signal, () => child.kill(signal)]));
  handlers.forEach((handler, signal) => process.once(signal, handler));
  try {
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    handlers.forEach((handler, signal) => process.removeListener(signal, handler));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runOfflineNext(process.argv[2]);
}
