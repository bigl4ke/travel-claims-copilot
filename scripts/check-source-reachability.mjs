import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validateSourceReviewRecord } from "../lib/release/release-evidence-runtime.mjs";

export const SOURCE_REVIEW_EXPORT_PATH = ".release/inputs/source.json";

const SOURCE_REVIEW_PATH = "docs/build-week/SOURCE_REVIEW.md";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SOURCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function gitText(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeAtomicJson(cwd, relativePath, value) {
  const destination = path.resolve(cwd, relativePath);
  const temporary = `${destination}.tmp-${process.pid}`;
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, destination);
}

function reviewedAtFromDocument(documentBytes) {
  const timestamps = documentBytes
    .toString("utf8")
    .match(/20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g);
  if (!timestamps?.length) throw new Error("source_review_timestamp_missing");
  return new Date(Math.max(...timestamps.map((value) => Date.parse(value)))).toISOString();
}

function sourceIsFresh(lastChecked, recordedAt) {
  if (typeof lastChecked !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(lastChecked)) return false;
  const checkedAt = Date.parse(`${lastChecked}T23:59:59.999Z`);
  const reference = Date.parse(recordedAt);
  return (
    Number.isFinite(checkedAt) &&
    Number.isFinite(reference) &&
    checkedAt <= reference + 24 * 60 * 60 * 1000 &&
    reference - checkedAt <= SOURCE_MAX_AGE_MS
  );
}

function sourceIsReachable(result) {
  if (!result || result.error === true || !Number.isSafeInteger(result.status)) return false;
  // 403/405 prove that the official host responded but restrict automated HEAD requests.
  // Their substantive content still requires the separately documented human/browser review.
  return (result.status >= 200 && result.status < 400) || [403, 405].includes(result.status);
}

export async function checkSourceReachability({ id, url }, fetcher = fetch) {
  const request = async () => {
    const response = await fetcher(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000)
    });
    return { id, status: response.status };
  };
  try {
    return await request();
  } catch {
    try {
      return await request();
    } catch {
      return { id, error: true };
    }
  }
}

export function buildSourceReviewRecord({
  releaseSha,
  recordedAt,
  reviewedAt,
  documentBytes,
  sources,
  reachability
}) {
  if (!SHA_PATTERN.test(releaseSha)) throw new Error("release_sha_invalid");
  if (!Buffer.isBuffer(documentBytes)) throw new Error("source_review_document_invalid");
  if (!Array.isArray(sources) || sources.length === 0 || !Array.isArray(reachability)) {
    throw new Error("source_review_sources_invalid");
  }
  const sourceIds = sources.map(({ id }) => id);
  const resultIds = reachability.map(({ id }) => id);
  if (
    sourceIds.some((id) => typeof id !== "string" || !id) ||
    new Set(sourceIds).size !== sourceIds.length ||
    new Set(resultIds).size !== resultIds.length ||
    sourceIds.length !== resultIds.length ||
    sourceIds.some((id) => !resultIds.includes(id))
  ) {
    throw new Error("source_review_sources_invalid");
  }

  const staleCount = sources.filter(
    ({ lastChecked }) => !sourceIsFresh(lastChecked, recordedAt)
  ).length;
  const unreachableCount = reachability.filter((result) => !sourceIsReachable(result)).length;
  const record = {
    schemaVersion: 1,
    releaseSha,
    recordedAt,
    status: staleCount === 0 && unreachableCount === 0 ? "passed" : "failed",
    documentPath: SOURCE_REVIEW_PATH,
    documentSha256: digest(documentBytes),
    reviewedAt,
    reachabilityCheckedAt: recordedAt,
    criticalSourceCount: sources.length,
    staleCount,
    unreachableCount
  };
  if (record.status === "passed") validateSourceReviewRecord(record, releaseSha, recordedAt);
  return record;
}

export async function runSourceReachabilityReview({
  releaseSha,
  networkApproved,
  cwd = process.cwd(),
  fetcher = fetch,
  readHead = () => gitText(cwd, ["rev-parse", "HEAD"]),
  readTrackedStatus = () => gitText(cwd, ["status", "--porcelain", "--untracked-files=no"]),
  now = () => new Date().toISOString()
}) {
  if (networkApproved !== true) throw new Error("source_network_approval_required");
  if (!SHA_PATTERN.test(releaseSha)) throw new Error("release_sha_invalid");
  if (readHead() !== releaseSha) throw new Error("release_sha_does_not_match_head");
  if (readTrackedStatus() !== "") throw new Error("tracked_files_must_be_clean");

  const policies = JSON.parse(readFileSync(path.resolve(cwd, "data/policies.json"), "utf8"));
  const commitments = JSON.parse(
    readFileSync(path.resolve(cwd, "data/carrier-commitments.json"), "utf8")
  );
  const sources = [
    ...policies.map((policy) => ({
      id: policy.policy_id,
      url: policy.source_url,
      lastChecked: policy.last_checked
    })),
    ...commitments.map((commitment) => ({
      id: commitment.commitment_id,
      url: commitment.source_url,
      lastChecked: commitment.last_checked
    }))
  ];
  const reachability = [];
  // Release checks are intentionally serial so official hosts are not burst-requested.
  // eslint-disable-next-line no-restricted-syntax
  for (const source of sources) {
    // eslint-disable-next-line no-await-in-loop
    reachability.push(await checkSourceReachability(source, fetcher));
  }
  const documentBytes = readFileSync(path.resolve(cwd, SOURCE_REVIEW_PATH));
  const record = buildSourceReviewRecord({
    releaseSha,
    recordedAt: now(),
    reviewedAt: reviewedAtFromDocument(documentBytes),
    documentBytes,
    sources,
    reachability
  });
  writeAtomicJson(cwd, SOURCE_REVIEW_EXPORT_PATH, record);
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
      "usage: check-source-reachability.mjs --network-approved --release-sha <40-lowercase-hex>"
    );
  }
  return args[2];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const record = await runSourceReachabilityReview({
      releaseSha: parseArguments(process.argv.slice(2)),
      networkApproved: true
    });
    process.stdout.write(
      `Source review ${record.status}: ${record.criticalSourceCount} checked, ${record.unreachableCount} unreachable.\n`
    );
    if (record.status !== "passed") process.exitCode = 1;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : "source_review_failed");
    process.exitCode = 1;
  }
}
