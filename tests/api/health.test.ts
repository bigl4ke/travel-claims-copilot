import { describe, expect, it } from "vitest";

import { GET } from "../../app/api/health/route";
import { buildHealthPayload } from "../../lib/release/release-metadata";

describe("non-sensitive health endpoint", () => {
  it("returns only the five public fields without environment values", async () => {
    const payload = await buildHealthPayload({
      env: {
        APP_VERSION: "1.2.3",
        VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
        OPENAI_API_KEY: "test-key",
        DEMO_ACCESS_CODE: "private-test-code"
      },
      loadKnowledge: async () => ({ version: "private-knowledge-version" })
    });

    expect(payload).toEqual({
      status: "ok",
      appVersion: "1.2.3",
      commitSha: "a".repeat(40),
      knowledgeStatus: "ready",
      openaiConfigured: true
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("test-key");
    expect(serialized).not.toContain("private-test-code");
    expect(serialized).not.toContain("private-knowledge-version");
  });

  it("fails closed to degraded metadata without exposing the load error", async () => {
    const payload = await buildHealthPayload({
      env: {},
      loadKnowledge: async () => {
        throw new Error("private-load-detail");
      }
    });

    expect(payload).toEqual({
      status: "degraded",
      appVersion: "0.1.0",
      commitSha: "local",
      knowledgeStatus: "unavailable",
      openaiConfigured: false
    });
    expect(JSON.stringify(payload)).not.toContain("private-load-detail");
  });

  it("serves no-store JSON with the exact health shape", async () => {
    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Object.keys(body).sort()).toEqual(
      ["appVersion", "commitSha", "knowledgeStatus", "openaiConfigured", "status"].sort()
    );
  });
});
