import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validateSecurityReviewRecord } from "../lib/release/release-evidence-runtime.mjs";

export const SECURITY_REVIEW_EXPORT_PATH = ".release/inputs/security.json";

const SECURITY_REVIEW_PATH = "docs/build-week/SECURITY_CHECK.md";
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function gitText(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function nonNegativeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function auditCounts(auditReport, auditCommandExitCode) {
  const high = nonNegativeCount(auditReport?.metadata?.vulnerabilities?.high);
  const critical = nonNegativeCount(auditReport?.metadata?.vulnerabilities?.critical);
  if (high === null || critical === null) {
    return { high: 0, critical: 0, unexplainedHighOrCritical: 1 };
  }
  const findings = high + critical;
  return {
    high,
    critical,
    unexplainedHighOrCritical: findings + (auditCommandExitCode !== 0 && findings === 0 ? 1 : 0)
  };
}

function writeAtomicJson(cwd, relativePath, value) {
  const destination = path.resolve(cwd, relativePath);
  const temporary = `${destination}.tmp-${process.pid}`;
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, destination);
}

export function buildSecurityReviewRecord({
  releaseSha,
  recordedAt,
  documentBytes,
  lockBytes,
  secretScanExitCode,
  auditReport,
  auditCommandExitCode = 0
}) {
  if (!SHA_PATTERN.test(releaseSha)) throw new Error("release_sha_invalid");
  if (!Buffer.isBuffer(documentBytes) || !Buffer.isBuffer(lockBytes)) {
    throw new Error("security_review_input_invalid");
  }
  const normalizedSecretExit = Number.isSafeInteger(secretScanExitCode) ? secretScanExitCode : 1;
  const audit = auditCounts(auditReport, auditCommandExitCode);
  const record = {
    schemaVersion: 1,
    releaseSha,
    recordedAt,
    status:
      normalizedSecretExit === 0 && audit.unexplainedHighOrCritical === 0 ? "passed" : "failed",
    documentPath: SECURITY_REVIEW_PATH,
    documentSha256: digest(documentBytes),
    lockSha256: digest(lockBytes),
    secretScanExitCode: normalizedSecretExit,
    audit
  };
  if (record.status === "passed") validateSecurityReviewRecord(record, releaseSha, recordedAt);
  return record;
}

export function runSecurityReview({
  releaseSha,
  networkApproved,
  cwd = process.cwd(),
  npmExecPath = process.env.npm_execpath,
  runCommand = spawnSync,
  readHead = () => gitText(cwd, ["rev-parse", "HEAD"]),
  readTrackedStatus = () => gitText(cwd, ["status", "--porcelain", "--untracked-files=no"]),
  now = () => new Date().toISOString()
}) {
  if (networkApproved !== true) throw new Error("security_network_approval_required");
  if (!SHA_PATTERN.test(releaseSha)) throw new Error("release_sha_invalid");
  if (readHead() !== releaseSha) throw new Error("release_sha_does_not_match_head");
  if (readTrackedStatus() !== "") throw new Error("tracked_files_must_be_clean");
  if (!npmExecPath) throw new Error("npm_execpath_is_required");

  const options = { cwd, encoding: "utf8", shell: false, maxBuffer: 10 * 1024 * 1024 };
  const secretResult = runCommand(process.execPath, [npmExecPath, "run", "scan:secrets"], options);
  const auditResult = runCommand(
    process.execPath,
    [npmExecPath, "audit", "--audit-level=high", "--json"],
    options
  );
  let auditReport = null;
  try {
    auditReport = JSON.parse(typeof auditResult.stdout === "string" ? auditResult.stdout : "");
  } catch {
    auditReport = null;
  }
  const record = buildSecurityReviewRecord({
    releaseSha,
    recordedAt: now(),
    documentBytes: readFileSync(path.resolve(cwd, SECURITY_REVIEW_PATH)),
    lockBytes: readFileSync(path.resolve(cwd, "package-lock.json")),
    secretScanExitCode: Number.isSafeInteger(secretResult.status) ? secretResult.status : 1,
    auditReport,
    auditCommandExitCode: Number.isSafeInteger(auditResult.status) ? auditResult.status : 1
  });
  writeAtomicJson(cwd, SECURITY_REVIEW_EXPORT_PATH, record);
  return record;
}

export function parseArguments(args) {
  if (
    args.length !== 3 ||
    args[0] !== "--network-approved" ||
    args[1] !== "--release-sha" ||
    !SHA_PATTERN.test(args[2])
  ) {
    throw new Error(
      "usage: check-release-security.mjs --network-approved --release-sha <40-lowercase-hex>"
    );
  }
  return args[2];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const record = runSecurityReview({
      releaseSha: parseArguments(process.argv.slice(2)),
      networkApproved: true
    });
    process.stdout.write(
      `Security review ${record.status}: ${record.audit.high} high, ${record.audit.critical} critical.\n`
    );
    if (record.status !== "passed") process.exitCode = 1;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : "security_review_failed");
    process.exitCode = 1;
  }
}
