import { loadKnowledgeSnapshot } from "../knowledge/load-knowledge";

export type HealthPayload = {
  status: "ok" | "degraded";
  appVersion: string;
  commitSha: string;
  knowledgeStatus: "ready" | "unavailable";
  openaiConfigured: boolean;
};

type HealthEnvironment = Record<string, string | undefined>;

function safeAppVersion(value: string | undefined): string {
  const candidate = value?.trim();
  return candidate && /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/.test(candidate) ? candidate : "0.1.0";
}

function safeCommitSha(value: string | undefined): string {
  const candidate = value?.trim();
  return candidate && /^[0-9a-f]{40}$/.test(candidate) ? candidate : "local";
}

export async function buildHealthPayload({
  env = process.env,
  loadKnowledge = loadKnowledgeSnapshot
}: {
  env?: HealthEnvironment;
  loadKnowledge?: () => Promise<unknown>;
} = {}): Promise<HealthPayload> {
  let knowledgeStatus: HealthPayload["knowledgeStatus"] = "unavailable";
  try {
    await loadKnowledge();
    knowledgeStatus = "ready";
  } catch {
    knowledgeStatus = "unavailable";
  }
  return {
    status: knowledgeStatus === "ready" ? "ok" : "degraded",
    appVersion: safeAppVersion(env.APP_VERSION),
    commitSha: safeCommitSha(env.VERCEL_GIT_COMMIT_SHA),
    knowledgeStatus,
    openaiConfigured: Boolean(env.OPENAI_API_KEY?.trim())
  };
}
