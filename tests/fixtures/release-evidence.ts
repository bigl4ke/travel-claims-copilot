import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  CiRecord,
  DeploymentRecord,
  LiveEvalRecord,
  SecurityReviewRecord,
  SourceReviewRecord,
  VerifyRecord
} from "../../lib/release/release-evidence-contract";
import { RELEASE_INPUT_PATHS } from "../../lib/release/release-evidence-contract";

export const releaseSha = "a".repeat(40);
export const releaseNow = "2026-07-20T00:00:00.000Z";
const recordedAt = "2026-07-19T23:30:00.000Z";
const digest = "b".repeat(64);

function metric(numerator: number, denominator: number) {
  return { numerator, denominator, rate: numerator / denominator };
}

function perfectMetrics() {
  const set = {
    attempted: 48,
    structuredOutputSuccessRate: metric(40, 40),
    macroCriticalFactAccuracy: metric(44, 44),
    journeyStatusAccuracy: metric(48, 48),
    injectionFailureRate: metric(0, 4),
    safetyFailureRate: metric(0, 4),
    validFallbackRate: metric(4, 4),
    transportFailureRate: metric(0, 48)
  };
  return { final: structuredClone(set), firstAttempt: structuredClone(set) };
}

function base() {
  return { schemaVersion: 1 as const, releaseSha, recordedAt, status: "passed" as const };
}

export function releaseFixture(): {
  verify: VerifyRecord;
  liveEval: LiveEvalRecord;
  ci: CiRecord;
  sourceReview: SourceReviewRecord;
  securityReview: SecurityReviewRecord;
  deployment: DeploymentRecord;
} {
  return {
    verify: {
      ...base(),
      command: "npm run verify",
      exitCode: 0,
      offlineBuild: true
    },
    liveEval: {
      ...base(),
      datasetVersion: "four-scenario-v1",
      scorerVersion: "claim-scorer-v1",
      model: "gpt-5.6-luna",
      attempted: 48,
      metrics: perfectMetrics(),
      thresholdsPassed: true,
      storesPromptsOrResponses: false,
      cases: Array.from({ length: 48 }, (_, index) => ({
        caseId: `eval-v1-fixture-${String(index + 1).padStart(2, "0")}`,
        attempts: [
          {
            attempt: 1,
            pass: true,
            criticalFieldNumerator: index < 4 ? 0 : 1,
            criticalFieldDenominator: index < 4 ? 0 : 1,
            latencyMs: 10,
            fallbackCategory: index >= 4 && index < 8 ? "openai_extractor_unavailable" : null,
            tokenUsage: index < 8 ? null : { inputTokens: 20, outputTokens: 10 }
          }
        ]
      }))
    },
    ci: {
      ...base(),
      workflowPath: ".github/workflows/ci.yml",
      runUrl: "https://github.example.test/actions/runs/123",
      headSha: releaseSha,
      conclusion: "success",
      jobs: { verify: "success", browser: "success" }
    },
    sourceReview: {
      ...base(),
      documentPath: "docs/build-week/SOURCE_REVIEW.md",
      documentSha256: digest,
      reviewedAt: "2026-07-19T04:38:07.000Z",
      reachabilityCheckedAt: recordedAt,
      criticalSourceCount: 12,
      staleCount: 0,
      unreachableCount: 0
    },
    securityReview: {
      ...base(),
      documentPath: "docs/build-week/SECURITY_CHECK.md",
      documentSha256: digest,
      lockSha256: "c".repeat(64),
      secretScanExitCode: 0,
      audit: { high: 0, critical: 0, unexplainedHighOrCritical: 0 }
    },
    deployment: {
      ...base(),
      preview: {
        url: "https://preview.example.test",
        deploymentId: "preview-deployment",
        localSmoke: "passed",
        gptSmoke: "passed"
      },
      production: {
        url: "https://travel-claims.example.test",
        deploymentId: "production-deployment",
        localSmoke: "passed",
        gptSmoke: "passed"
      },
      fourJourneyE2e: "passed",
      controls: {
        globalRateLimitProved: false,
        spendLimitConfigured: false,
        judgeGated: true
      },
      rollback: { deploymentId: "prior-production", commitSha: "d".repeat(40) }
    }
  };
}

function writeJson(cwd: string, relativePath: string, value: unknown): void {
  const absolutePath = path.join(cwd, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function createReleaseInputTree(): { cwd: string; cleanup(): void } {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "release-evidence-"));
  const fixture = releaseFixture();
  writeJson(cwd, RELEASE_INPUT_PATHS.verify, fixture.verify);
  writeJson(cwd, RELEASE_INPUT_PATHS.liveEval, fixture.liveEval);
  writeJson(cwd, RELEASE_INPUT_PATHS.ci, fixture.ci);
  writeJson(cwd, RELEASE_INPUT_PATHS.sourceReview, fixture.sourceReview);
  writeJson(cwd, RELEASE_INPUT_PATHS.securityReview, fixture.securityReview);
  writeJson(cwd, RELEASE_INPUT_PATHS.deployment, fixture.deployment);

  const runBytes = RELEASE_INPUT_PATHS.e2eRuns.map((relativePath, index) => {
    const bytes = Buffer.from(
      JSON.stringify({
        config: {},
        suites: [],
        errors: [],
        stats: { expected: 41 + index, unexpected: 0, flaky: 0, skipped: 0 }
      })
    );
    const absolutePath = path.join(cwd, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, bytes);
    return bytes;
  });
  writeJson(cwd, RELEASE_INPUT_PATHS.e2eManifest, {
    schemaVersion: 1,
    releaseSha,
    generatedAt: recordedAt,
    runs: RELEASE_INPUT_PATHS.e2eRuns.map((resultPath, index) => ({
      index: index + 1,
      resultPath,
      sha256: createHash("sha256").update(runBytes[index]).digest("hex"),
      exitCode: 0,
      status: "passed",
      counts: { expected: 41 + index, unexpected: 0, flaky: 0, skipped: 0 }
    }))
  });

  return {
    cwd,
    cleanup() {
      rmSync(cwd, { recursive: true, force: true });
    }
  };
}
