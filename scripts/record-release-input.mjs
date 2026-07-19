import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RELEASE_INPUT_PATHS,
  validateCiRecord,
  validateDeploymentRecord,
  validateSecurityReviewRecord,
  validateSourceReviewRecord
} from "../lib/release/release-evidence-runtime.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_INPUT_BYTES = 1_000_000;
const kinds = Object.freeze({
  source: {
    destination: RELEASE_INPUT_PATHS.sourceReview,
    validate: validateSourceReviewRecord
  },
  security: {
    destination: RELEASE_INPUT_PATHS.securityReview,
    validate: validateSecurityReviewRecord
  },
  ci: { destination: RELEASE_INPUT_PATHS.ci, validate: validateCiRecord },
  deployment: {
    destination: RELEASE_INPUT_PATHS.deployment,
    validate: validateDeploymentRecord
  }
});

function writeAtomicJson(cwd, relativePath, value) {
  const destination = path.resolve(cwd, relativePath);
  const temporary = `${destination}.tmp-${process.pid}`;
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, destination);
}

export function recordReleaseInput({
  kind,
  releaseSha,
  inputPath,
  cwd = process.cwd(),
  now = new Date().toISOString()
}) {
  const contract = kinds[kind];
  if (!contract) throw new Error("release_input_kind_invalid");
  if (!SHA_PATTERN.test(releaseSha)) throw new Error("release_sha_must_be_lowercase_40_hex");
  if (typeof inputPath !== "string" || !inputPath.trim())
    throw new Error("release_input_path_invalid");

  const absoluteInput = path.resolve(cwd, inputPath);
  const destination = path.resolve(cwd, contract.destination);
  if (absoluteInput === destination) throw new Error("release_input_must_be_external");
  if (statSync(absoluteInput).size > MAX_INPUT_BYTES) throw new Error("release_input_too_large");

  const candidate = JSON.parse(readFileSync(absoluteInput, "utf8"));
  const record = contract.validate(candidate, releaseSha, now);
  writeAtomicJson(cwd, contract.destination, record);
  return { destination: contract.destination, record };
}

export function parseArguments(args) {
  if (
    args.length !== 6 ||
    args[0] !== "--kind" ||
    !Object.hasOwn(kinds, args[1]) ||
    args[2] !== "--release-sha" ||
    !SHA_PATTERN.test(args[3]) ||
    args[4] !== "--input" ||
    !args[5].trim()
  ) {
    throw new Error(
      "usage: record-release-input.mjs --kind <source|security|ci|deployment> --release-sha <40-lowercase-hex> --input <machine-json>"
    );
  }
  return { kind: args[1], releaseSha: args[3], inputPath: args[5] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    recordReleaseInput(parseArguments(process.argv.slice(2)));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : "release_input_record_failed");
    process.exitCode = 1;
  }
}
