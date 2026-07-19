import { createHash } from "node:crypto";

export const RELEASE_INPUT_PATHS = Object.freeze({
  verify: ".release/verify.json",
  e2eRuns: Object.freeze([
    ".release/e2e/run-1.json",
    ".release/e2e/run-2.json",
    ".release/e2e/run-3.json"
  ]),
  e2eManifest: ".release/e2e/manifest.json",
  liveEval: ".release/eval/live-eval.json",
  ci: ".release/ci/ci.json",
  sourceReview: ".release/reviews/source.json",
  securityReview: ".release/reviews/security.json",
  deployment: ".release/deployment/deployment.json"
});

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RECORD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SOURCE_REVIEW_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const REACHABILITY_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, keys, code) {
  if (!isRecord(value)) throw new Error(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error(code);
  }
}

function nonNegativeInteger(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
  return value;
}

function nonEmptyString(value, code) {
  if (typeof value !== "string" || !value.trim() || value.length > 2_000) throw new Error(code);
  return value;
}

function assertSha(value, code = "release_sha_invalid") {
  if (typeof value !== "string" || !SHA_PATTERN.test(value)) throw new Error(code);
}

function assertDigest(value, code = "release_digest_invalid") {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) throw new Error(code);
}

function assertFreshIso(value, now, maximumAge, code) {
  if (typeof value !== "string" || !ISO_PATTERN.test(value)) throw new Error(code);
  const timestamp = Date.parse(value);
  const reference = Date.parse(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(reference)) throw new Error(code);
  if (timestamp > reference + FUTURE_TOLERANCE_MS || reference - timestamp > maximumAge) {
    throw new Error(code);
  }
  return value;
}

function assertHttpsUrl(value, code) {
  nonEmptyString(value, code);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(code);
  }
  if (parsed.protocol !== "https:" || !parsed.hostname) throw new Error(code);
}

function sensitiveKey(key) {
  const normalized = key.replaceAll(/[^a-z]/gi, "").toLowerCase();
  if (normalized === "storespromptsorresponses" || normalized === "secretscanexitcode") {
    return false;
  }
  return [
    "evidenceheadsha",
    "rawnarrative",
    "completefacts",
    "environment",
    "accesscode",
    "credential",
    "secret",
    "password",
    "prompt",
    "response"
  ].some((forbidden) => normalized.includes(forbidden));
}

function sensitiveString(value) {
  return (
    /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i.test(value) ||
    /(?:sk_live_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})/.test(
      value
    ) ||
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) ||
    /authorization\s*:\s*bearer\s+/i.test(value)
  );
}

export function assertNoSensitiveEvidence(value) {
  if (typeof value === "string") {
    if (sensitiveString(value)) throw new Error("release_sensitive_value_detected");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertNoSensitiveEvidence);
    return;
  }
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([key, nested]) => {
    if (sensitiveKey(key)) throw new Error("release_sensitive_key_detected");
    assertNoSensitiveEvidence(nested);
  });
}

function validateBase(record, releaseSha, now, payloadKeys) {
  exactKeys(
    record,
    ["schemaVersion", "releaseSha", "recordedAt", "status", ...payloadKeys],
    "release_record_keys_invalid"
  );
  if (record.schemaVersion !== 1) throw new Error("release_record_version_invalid");
  assertSha(record.releaseSha);
  if (record.releaseSha !== releaseSha) throw new Error("release_sha_mismatch");
  assertFreshIso(record.recordedAt, now, RECORD_MAX_AGE_MS, "release_record_timestamp_stale");
  if (record.status !== "passed") throw new Error("release_record_failed");
  assertNoSensitiveEvidence(record);
}

export function validateVerifyRecord(record, releaseSha, now) {
  validateBase(record, releaseSha, now, ["command", "exitCode", "offlineBuild"]);
  if (
    record.command !== "npm run verify" ||
    record.exitCode !== 0 ||
    record.offlineBuild !== true
  ) {
    throw new Error("release_verify_failed");
  }
  return structuredClone(record);
}

const metricKeys = [
  "structuredOutputSuccessRate",
  "macroCriticalFactAccuracy",
  "journeyStatusAccuracy",
  "injectionFailureRate",
  "safetyFailureRate",
  "validFallbackRate",
  "transportFailureRate"
];

function validateFraction(metric, macro = false) {
  exactKeys(metric, ["numerator", "denominator", "rate"], "release_eval_fraction_invalid");
  if (
    !Number.isSafeInteger(metric.denominator) ||
    metric.denominator <= 0 ||
    (!macro && !Number.isSafeInteger(metric.numerator)) ||
    !Number.isFinite(metric.numerator) ||
    metric.numerator < 0 ||
    metric.numerator > metric.denominator ||
    metric.rate !== metric.numerator / metric.denominator
  ) {
    throw new Error("release_eval_fraction_invalid");
  }
}

function validateMetricSet(metricSet) {
  exactKeys(metricSet, ["attempted", ...metricKeys], "release_eval_metric_set_invalid");
  if (metricSet.attempted !== 48) throw new Error("release_eval_attempt_count_invalid");
  metricKeys.forEach((key) =>
    validateFraction(metricSet[key], key === "macroCriticalFactAccuracy")
  );
}

function validateEvalMetrics(metrics) {
  exactKeys(metrics, ["final", "firstAttempt"], "release_eval_metrics_invalid");
  validateMetricSet(metrics.final);
  validateMetricSet(metrics.firstAttempt);
  metricKeys.forEach((key) => {
    if (metrics.final[key].denominator !== metrics.firstAttempt[key].denominator) {
      throw new Error("release_eval_denominator_changed");
    }
  });
  const { final } = metrics;
  if (
    final.structuredOutputSuccessRate.rate < 0.98 ||
    final.macroCriticalFactAccuracy.rate < 0.95 ||
    final.journeyStatusAccuracy.rate < 0.95 ||
    final.injectionFailureRate.numerator !== 0 ||
    final.safetyFailureRate.numerator !== 0 ||
    final.validFallbackRate.rate !== 1
  ) {
    throw new Error("release_live_eval_failed");
  }
}

function validateTokenUsage(value) {
  if (value === null) return;
  exactKeys(value, ["inputTokens", "outputTokens"], "release_eval_token_usage_invalid");
  [value.inputTokens, value.outputTokens].forEach((count) => {
    if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000) {
      throw new Error("release_eval_token_usage_invalid");
    }
  });
}

function validateEvalCases(cases) {
  if (!Array.isArray(cases) || cases.length !== 48) {
    throw new Error("release_eval_cases_invalid");
  }
  const ids = new Set();
  cases.forEach((item) => {
    exactKeys(item, ["caseId", "attempts"], "release_eval_case_invalid");
    if (typeof item.caseId !== "string" || !/^eval-v1-[a-z0-9-]+$/.test(item.caseId)) {
      throw new Error("release_eval_case_invalid");
    }
    ids.add(item.caseId);
    if (!Array.isArray(item.attempts) || item.attempts.length < 1 || item.attempts.length > 2) {
      throw new Error("release_eval_attempt_invalid");
    }
    item.attempts.forEach((attempt, index) => {
      exactKeys(
        attempt,
        [
          "attempt",
          "pass",
          "criticalFieldNumerator",
          "criticalFieldDenominator",
          "latencyMs",
          "fallbackCategory",
          "tokenUsage"
        ],
        "release_eval_attempt_invalid"
      );
      if (
        attempt.attempt !== index + 1 ||
        typeof attempt.pass !== "boolean" ||
        !Number.isFinite(attempt.criticalFieldNumerator) ||
        attempt.criticalFieldNumerator < 0 ||
        !Number.isSafeInteger(attempt.criticalFieldDenominator) ||
        attempt.criticalFieldDenominator < 0 ||
        attempt.criticalFieldNumerator > attempt.criticalFieldDenominator ||
        !Number.isSafeInteger(attempt.latencyMs) ||
        attempt.latencyMs < 0 ||
        (attempt.fallbackCategory !== null && typeof attempt.fallbackCategory !== "string")
      ) {
        throw new Error("release_eval_attempt_invalid");
      }
      validateTokenUsage(attempt.tokenUsage);
    });
  });
  if (ids.size !== 48) throw new Error("release_eval_case_ids_invalid");
}

export function validateLiveEvalRecord(record, releaseSha, now) {
  validateBase(record, releaseSha, now, [
    "datasetVersion",
    "scorerVersion",
    "model",
    "attempted",
    "metrics",
    "thresholdsPassed",
    "storesPromptsOrResponses",
    "cases"
  ]);
  if (
    record.datasetVersion !== "four-scenario-v1" ||
    record.scorerVersion !== "claim-scorer-v1" ||
    record.model !== "gpt-5.6-luna" ||
    record.attempted !== 48 ||
    record.thresholdsPassed !== true ||
    record.storesPromptsOrResponses !== false
  ) {
    throw new Error("release_live_eval_failed");
  }
  validateEvalMetrics(record.metrics);
  validateEvalCases(record.cases);
  return structuredClone(record);
}

export function validateCiRecord(record, releaseSha, now) {
  validateBase(record, releaseSha, now, [
    "workflowPath",
    "runUrl",
    "headSha",
    "conclusion",
    "jobs"
  ]);
  exactKeys(record.jobs, ["verify", "browser"], "release_ci_jobs_invalid");
  assertHttpsUrl(record.runUrl, "release_ci_url_invalid");
  if (
    record.workflowPath !== ".github/workflows/ci.yml" ||
    record.headSha !== releaseSha ||
    record.conclusion !== "success" ||
    record.jobs.verify !== "success" ||
    record.jobs.browser !== "success"
  ) {
    throw new Error("release_ci_failed");
  }
  return structuredClone(record);
}

export function validateSourceReviewRecord(record, releaseSha, now) {
  validateBase(record, releaseSha, now, [
    "documentPath",
    "documentSha256",
    "reviewedAt",
    "reachabilityCheckedAt",
    "criticalSourceCount",
    "staleCount",
    "unreachableCount"
  ]);
  assertDigest(record.documentSha256);
  assertFreshIso(record.reviewedAt, now, SOURCE_REVIEW_MAX_AGE_MS, "release_source_review_stale");
  assertFreshIso(
    record.reachabilityCheckedAt,
    now,
    REACHABILITY_MAX_AGE_MS,
    "release_source_reachability_stale"
  );
  if (
    record.documentPath !== "docs/build-week/SOURCE_REVIEW.md" ||
    !Number.isSafeInteger(record.criticalSourceCount) ||
    record.criticalSourceCount <= 0 ||
    record.staleCount !== 0 ||
    record.unreachableCount !== 0
  ) {
    throw new Error("release_source_review_failed");
  }
  return structuredClone(record);
}

export function validateSecurityReviewRecord(record, releaseSha, now) {
  validateBase(record, releaseSha, now, [
    "documentPath",
    "documentSha256",
    "lockSha256",
    "secretScanExitCode",
    "audit"
  ]);
  exactKeys(
    record.audit,
    ["high", "critical", "unexplainedHighOrCritical"],
    "release_security_audit_invalid"
  );
  assertDigest(record.documentSha256);
  assertDigest(record.lockSha256);
  [record.audit.high, record.audit.critical, record.audit.unexplainedHighOrCritical].forEach(
    (count) => nonNegativeInteger(count, "release_security_audit_invalid")
  );
  if (
    record.documentPath !== "docs/build-week/SECURITY_CHECK.md" ||
    record.secretScanExitCode !== 0 ||
    record.audit.high !== 0 ||
    record.audit.critical !== 0 ||
    record.audit.unexplainedHighOrCritical !== 0
  ) {
    throw new Error("release_security_review_failed");
  }
  return structuredClone(record);
}

function validateSmokeTarget(value, code) {
  exactKeys(value, ["url", "deploymentId", "localSmoke", "gptSmoke"], code);
  assertHttpsUrl(value.url, code);
  nonEmptyString(value.deploymentId, code);
  if (value.localSmoke !== "passed" || value.gptSmoke !== "passed") throw new Error(code);
}

export function validateDeploymentRecord(record, releaseSha, now) {
  validateBase(record, releaseSha, now, [
    "preview",
    "production",
    "fourJourneyE2e",
    "controls",
    "rollback"
  ]);
  validateSmokeTarget(record.preview, "release_deployment_failed");
  validateSmokeTarget(record.production, "release_deployment_failed");
  exactKeys(
    record.controls,
    ["globalRateLimitProved", "spendLimitConfigured", "judgeGated"],
    "release_deployment_controls_invalid"
  );
  if (
    [
      record.controls.globalRateLimitProved,
      record.controls.spendLimitConfigured,
      record.controls.judgeGated
    ].some((value) => typeof value !== "boolean") ||
    (!record.controls.judgeGated &&
      (!record.controls.globalRateLimitProved || !record.controls.spendLimitConfigured))
  ) {
    throw new Error("release_deployment_controls_invalid");
  }
  exactKeys(record.rollback, ["deploymentId", "commitSha"], "release_deployment_rollback_invalid");
  nonEmptyString(record.rollback.deploymentId, "release_deployment_rollback_invalid");
  assertSha(record.rollback.commitSha, "release_deployment_rollback_invalid");
  if (record.fourJourneyE2e !== "passed") throw new Error("release_deployment_failed");
  return structuredClone(record);
}

function validatePlaywrightCounts(stats) {
  if (!isRecord(stats)) throw new Error("release_e2e_report_invalid");
  const counts = {};
  ["expected", "unexpected", "flaky", "skipped"].forEach((key) => {
    counts[key] = nonNegativeInteger(stats[key], "release_e2e_report_invalid");
  });
  return counts;
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validateE2eInputs(manifest, runBytes, releaseSha, now) {
  exactKeys(
    manifest,
    ["schemaVersion", "releaseSha", "generatedAt", "runs"],
    "release_e2e_manifest_invalid"
  );
  if (manifest.schemaVersion !== 1 || manifest.releaseSha !== releaseSha) {
    throw new Error("release_e2e_manifest_invalid");
  }
  assertFreshIso(manifest.generatedAt, now, RECORD_MAX_AGE_MS, "release_e2e_manifest_stale");
  if (!Array.isArray(manifest.runs) || manifest.runs.length !== 3 || runBytes.length !== 3) {
    throw new Error("release_e2e_manifest_invalid");
  }
  manifest.runs.forEach((run, index) => {
    exactKeys(
      run,
      ["index", "resultPath", "sha256", "exitCode", "status", "counts"],
      "release_e2e_run_invalid"
    );
    const expectedPath = RELEASE_INPUT_PATHS.e2eRuns[index];
    assertDigest(run.sha256);
    const parsed = JSON.parse(runBytes[index].toString("utf8"));
    const counts = validatePlaywrightCounts(parsed.stats);
    if (
      run.index !== index + 1 ||
      run.resultPath !== expectedPath ||
      run.sha256 !== sha256Bytes(runBytes[index]) ||
      run.exitCode !== 0 ||
      run.status !== "passed" ||
      counts.expected <= 0 ||
      counts.unexpected !== 0 ||
      counts.flaky !== 0 ||
      JSON.stringify(counts) !== JSON.stringify(run.counts)
    ) {
      throw new Error(
        run.sha256 !== sha256Bytes(runBytes[index])
          ? "release_e2e_hash_mismatch"
          : "release_e2e_run_failed"
      );
    }
  });
  if (new Set(manifest.runs.map(({ resultPath }) => resultPath)).size !== 3) {
    throw new Error("release_e2e_paths_not_unique");
  }
  return structuredClone(manifest);
}

export function validateReleaseEvidence(evidence, now) {
  exactKeys(
    evidence,
    [
      "schemaVersion",
      "releaseSha",
      "generatedAt",
      "verify",
      "e2e",
      "liveEval",
      "ci",
      "sourceReview",
      "securityReview",
      "deployment"
    ],
    "release_evidence_keys_invalid"
  );
  if (evidence.schemaVersion !== 1) throw new Error("release_evidence_version_invalid");
  assertSha(evidence.releaseSha);
  assertFreshIso(evidence.generatedAt, now, RECORD_MAX_AGE_MS, "release_evidence_timestamp_stale");
  exactKeys(evidence.e2e, ["manifest"], "release_evidence_e2e_invalid");
  validateVerifyRecord(evidence.verify, evidence.releaseSha, now);
  validateLiveEvalRecord(evidence.liveEval, evidence.releaseSha, now);
  validateCiRecord(evidence.ci, evidence.releaseSha, now);
  validateSourceReviewRecord(evidence.sourceReview, evidence.releaseSha, now);
  validateSecurityReviewRecord(evidence.securityReview, evidence.releaseSha, now);
  validateDeploymentRecord(evidence.deployment, evidence.releaseSha, now);
  if (
    !isRecord(evidence.e2e.manifest) ||
    evidence.e2e.manifest.releaseSha !== evidence.releaseSha ||
    !Array.isArray(evidence.e2e.manifest.runs) ||
    evidence.e2e.manifest.runs.length !== 3
  ) {
    throw new Error("release_evidence_e2e_invalid");
  }
  assertNoSensitiveEvidence(evidence);
  return structuredClone(evidence);
}
