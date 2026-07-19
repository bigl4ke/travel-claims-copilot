import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RUN_COUNT = 3;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const relativeRunPaths = [
  ".release/e2e/run-1.json",
  ".release/e2e/run-2.json",
  ".release/e2e/run-3.json"
];
const relativeManifestPath = ".release/e2e/manifest.json";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function failedCounts() {
  return { expected: 0, unexpected: 1, flaky: 0, skipped: 0 };
}

export function parsePlaywrightCounts(bytes) {
  const report = JSON.parse(bytes.toString("utf8"));
  if (!report || typeof report !== "object" || !report.stats || typeof report.stats !== "object") {
    throw new Error("playwright_report_stats_missing");
  }
  const counts = {};
  ["expected", "unexpected", "flaky", "skipped"].forEach((key) => {
    const value = report.stats[key];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`playwright_report_${key}_invalid`);
    }
    counts[key] = value;
  });
  return counts;
}

function waitForChild(child) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    child.once("error", () => finish(1));
    child.once("exit", (code) => finish(Number.isInteger(code) ? code : 1));
  });
}

function gitText(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function validateRehearsalManifest(manifest, cwd) {
  if (
    !manifest ||
    manifest.schemaVersion !== 1 ||
    !SHA_PATTERN.test(manifest.releaseSha) ||
    !Array.isArray(manifest.runs) ||
    manifest.runs.length !== RUN_COUNT
  ) {
    throw new Error("e2e_rehearsal_manifest_invalid");
  }
  const paths = manifest.runs.map(({ resultPath }) => resultPath);
  if (new Set(paths).size !== RUN_COUNT) throw new Error("e2e_rehearsal_paths_not_unique");
  manifest.runs.forEach((run, offset) => {
    if (run.index !== offset + 1 || run.resultPath !== relativeRunPaths[offset]) {
      throw new Error("e2e_rehearsal_run_identity_invalid");
    }
    const absolutePath = path.resolve(cwd, run.resultPath);
    if (!existsSync(absolutePath)) throw new Error(`e2e_rehearsal_run_${run.index}_missing`);
    const bytes = readFileSync(absolutePath);
    if (sha256(bytes) !== run.sha256) {
      throw new Error(`e2e_rehearsal_run_${run.index}_hash_mismatch`);
    }
    const counts = parsePlaywrightCounts(bytes);
    if (JSON.stringify(counts) !== JSON.stringify(run.counts)) {
      throw new Error(`e2e_rehearsal_run_${run.index}_counts_mismatch`);
    }
    if (
      run.exitCode !== 0 ||
      run.status !== "passed" ||
      counts.unexpected !== 0 ||
      counts.flaky !== 0
    ) {
      throw new Error(`e2e_rehearsal_run_${run.index}_failed`);
    }
  });
  return manifest;
}

export async function runE2eRehearsals({
  releaseSha,
  cwd = process.cwd(),
  spawnChild = spawn,
  readHead = () => gitText(cwd, ["rev-parse", "HEAD"]),
  readTrackedStatus = () => gitText(cwd, ["status", "--porcelain", "--untracked-files=no"]),
  now = () => new Date().toISOString(),
  npmExecPath = process.env.npm_execpath
}) {
  if (!SHA_PATTERN.test(releaseSha)) throw new Error("release_sha_must_be_lowercase_40_hex");
  if (releaseSha !== readHead()) throw new Error("release_sha_does_not_match_head");
  if (readTrackedStatus() !== "") throw new Error("tracked_files_must_be_clean");
  if (!npmExecPath) throw new Error("npm_execpath_is_required");

  const releaseDirectory = path.resolve(cwd, ".release/e2e");
  mkdirSync(releaseDirectory, { recursive: true });
  [...relativeRunPaths, relativeManifestPath].forEach((relativePath) => {
    rmSync(path.resolve(cwd, relativePath), { force: true });
  });

  const runs = [];
  // The release contract requires the three browser runs to be strictly sequential.
  // eslint-disable-next-line no-restricted-syntax
  for (let offset = 0; offset < RUN_COUNT; offset += 1) {
    const index = offset + 1;
    const resultPath = relativeRunPaths[offset];
    const absoluteResultPath = path.resolve(cwd, resultPath);
    const child = spawnChild(process.execPath, [npmExecPath, "run", "test:e2e"], {
      cwd,
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT: absoluteResultPath },
      stdio: "inherit",
      shell: false
    });
    // eslint-disable-next-line no-await-in-loop
    const exitCode = await waitForChild(child);
    let bytes = Buffer.alloc(0);
    let counts = failedCounts();
    let reportValid = false;
    if (existsSync(absoluteResultPath)) {
      bytes = readFileSync(absoluteResultPath);
      try {
        counts = parsePlaywrightCounts(bytes);
        reportValid = true;
      } catch {
        reportValid = false;
      }
    }
    const passed = exitCode === 0 && reportValid && counts.unexpected === 0 && counts.flaky === 0;
    runs.push({
      index,
      resultPath,
      sha256: sha256(bytes),
      exitCode,
      status: passed ? "passed" : "failed",
      counts
    });
  }

  const manifest = {
    schemaVersion: 1,
    releaseSha,
    generatedAt: now(),
    runs
  };
  const manifestPath = path.resolve(cwd, relativeManifestPath);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  validateRehearsalManifest(manifest, cwd);
  return manifest;
}

export function parseArguments(args) {
  if (args.length !== 2 || args[0] !== "--release-sha") {
    throw new Error("usage: run-e2e-rehearsals.mjs --release-sha <40-lowercase-hex>");
  }
  return args[1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runE2eRehearsals({ releaseSha: parseArguments(process.argv.slice(2)) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : "e2e_rehearsal_failed");
    process.exitCode = 1;
  }
}
