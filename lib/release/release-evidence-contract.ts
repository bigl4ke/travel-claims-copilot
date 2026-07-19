import type { EvalMetrics } from "../../evals/scorer";

// @ts-expect-error The runtime validators are shared with Node-only release scripts.
import * as runtime from "./release-evidence-runtime.mjs";

export const RELEASE_INPUT_PATHS = {
  verify: ".release/verify.json",
  e2eRuns: [".release/e2e/run-1.json", ".release/e2e/run-2.json", ".release/e2e/run-3.json"],
  e2eManifest: ".release/e2e/manifest.json",
  liveEval: ".release/eval/live-eval.json",
  ci: ".release/ci/ci.json",
  sourceReview: ".release/reviews/source.json",
  securityReview: ".release/reviews/security.json",
  deployment: ".release/deployment/deployment.json"
} as const;

export type ReleaseRecordBase = {
  schemaVersion: 1;
  releaseSha: string;
  recordedAt: string;
  status: "passed" | "failed";
};

export type VerifyRecord = ReleaseRecordBase & {
  command: "npm run verify";
  exitCode: number;
  offlineBuild: true;
};

export type LiveEvalRecord = ReleaseRecordBase & {
  datasetVersion: "four-scenario-v1";
  scorerVersion: "claim-scorer-v1";
  model: "gpt-5.6-luna";
  attempted: 48;
  metrics: EvalMetrics;
  thresholdsPassed: boolean;
  storesPromptsOrResponses: false;
  cases: Array<{
    caseId: string;
    attempts: Array<{
      attempt: number;
      pass: boolean;
      criticalFieldNumerator: number;
      criticalFieldDenominator: number;
      latencyMs: number;
      fallbackCategory: string | null;
      tokenUsage: { inputTokens: number; outputTokens: number } | null;
    }>;
  }>;
};

export type CiRecord = ReleaseRecordBase & {
  workflowPath: ".github/workflows/ci.yml";
  runUrl: string;
  headSha: string;
  conclusion: "success" | "failure" | "cancelled";
  jobs: { verify: "success"; browser: "success" };
};

export type SourceReviewRecord = ReleaseRecordBase & {
  documentPath: "docs/build-week/SOURCE_REVIEW.md";
  documentSha256: string;
  reviewedAt: string;
  reachabilityCheckedAt: string;
  criticalSourceCount: number;
  staleCount: number;
  unreachableCount: number;
};

export type SecurityReviewRecord = ReleaseRecordBase & {
  documentPath: "docs/build-week/SECURITY_CHECK.md";
  documentSha256: string;
  lockSha256: string;
  secretScanExitCode: number;
  audit: { high: number; critical: number; unexplainedHighOrCritical: number };
};

export type DeploymentRecord = ReleaseRecordBase & {
  preview: { url: string; deploymentId: string; localSmoke: "passed"; gptSmoke: "passed" };
  production: { url: string; deploymentId: string; localSmoke: "passed"; gptSmoke: "passed" };
  fourJourneyE2e: "passed";
  controls: {
    globalRateLimitProved: boolean;
    spendLimitConfigured: boolean;
    judgeGated: boolean;
  };
  rollback: { deploymentId: string; commitSha: string };
};

export type ReleaseEvidence = {
  schemaVersion: 1;
  releaseSha: string;
  generatedAt: string;
  verify: VerifyRecord;
  e2e: { manifest: Record<string, unknown> };
  liveEval: LiveEvalRecord;
  ci: CiRecord;
  sourceReview: SourceReviewRecord;
  securityReview: SecurityReviewRecord;
  deployment: DeploymentRecord;
};

export const validateVerifyRecord = runtime.validateVerifyRecord as (
  value: unknown,
  releaseSha: string,
  now: string
) => VerifyRecord;
export const validateLiveEvalRecord = runtime.validateLiveEvalRecord as (
  value: unknown,
  releaseSha: string,
  now: string
) => LiveEvalRecord;
export const validateCiRecord = runtime.validateCiRecord as (
  value: unknown,
  releaseSha: string,
  now: string
) => CiRecord;
export const validateSourceReviewRecord = runtime.validateSourceReviewRecord as (
  value: unknown,
  releaseSha: string,
  now: string
) => SourceReviewRecord;
export const validateSecurityReviewRecord = runtime.validateSecurityReviewRecord as (
  value: unknown,
  releaseSha: string,
  now: string
) => SecurityReviewRecord;
export const validateDeploymentRecord = runtime.validateDeploymentRecord as (
  value: unknown,
  releaseSha: string,
  now: string
) => DeploymentRecord;
export const validateE2eInputs = runtime.validateE2eInputs as (
  manifest: unknown,
  runBytes: Buffer[],
  releaseSha: string,
  now: string
) => Record<string, unknown>;
export const validateReleaseEvidence = runtime.validateReleaseEvidence as (
  value: unknown,
  now: string
) => ReleaseEvidence;
