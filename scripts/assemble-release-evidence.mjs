import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RELEASE_INPUT_PATHS,
  validateCiRecord,
  validateDeploymentRecord,
  validateE2eInputs,
  validateLiveEvalRecord,
  validateReleaseEvidence,
  validateSecurityReviewRecord,
  validateSourceReviewRecord,
  validateVerifyRecord
} from "../lib/release/release-evidence-runtime.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const outputPath = "artifacts/release-evidence.json";

function readJson(cwd, relativePath) {
  return JSON.parse(readFileSync(path.resolve(cwd, relativePath), "utf8"));
}

export function assembleReleaseEvidence({
  cwd = process.cwd(),
  releaseSha,
  now = new Date().toISOString()
}) {
  if (!SHA_PATTERN.test(releaseSha)) throw new Error("release_sha_invalid");
  const verify = validateVerifyRecord(readJson(cwd, RELEASE_INPUT_PATHS.verify), releaseSha, now);
  const runBytes = RELEASE_INPUT_PATHS.e2eRuns.map((relativePath) =>
    readFileSync(path.resolve(cwd, relativePath))
  );
  const manifest = validateE2eInputs(
    readJson(cwd, RELEASE_INPUT_PATHS.e2eManifest),
    runBytes,
    releaseSha,
    now
  );
  const liveEval = validateLiveEvalRecord(
    readJson(cwd, RELEASE_INPUT_PATHS.liveEval),
    releaseSha,
    now
  );
  const ci = validateCiRecord(readJson(cwd, RELEASE_INPUT_PATHS.ci), releaseSha, now);
  const sourceReview = validateSourceReviewRecord(
    readJson(cwd, RELEASE_INPUT_PATHS.sourceReview),
    releaseSha,
    now
  );
  const securityReview = validateSecurityReviewRecord(
    readJson(cwd, RELEASE_INPUT_PATHS.securityReview),
    releaseSha,
    now
  );
  const deployment = validateDeploymentRecord(
    readJson(cwd, RELEASE_INPUT_PATHS.deployment),
    releaseSha,
    now
  );
  const evidence = validateReleaseEvidence(
    {
      schemaVersion: 1,
      releaseSha,
      generatedAt: now,
      verify,
      e2e: { manifest },
      liveEval,
      ci,
      sourceReview,
      securityReview,
      deployment
    },
    now
  );
  const absoluteOutput = path.resolve(cwd, outputPath);
  const temporaryOutput = `${absoluteOutput}.tmp`;
  mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  writeFileSync(temporaryOutput, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  renameSync(temporaryOutput, absoluteOutput);
  return evidence;
}

function parseArguments(args) {
  if (args.length !== 2 || args[0] !== "--release-sha" || !SHA_PATTERN.test(args[1])) {
    throw new Error("usage: assemble-release-evidence.mjs --release-sha <40-lowercase-hex>");
  }
  return args[1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assembleReleaseEvidence({ releaseSha: parseArguments(process.argv.slice(2)) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : "release_evidence_failed");
    process.exitCode = 1;
  }
}
