import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { RELEASE_INPUT_PATHS } from "../lib/release/release-evidence-runtime.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function gitText(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function spawnCommand(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, options);
    let settled = false;
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      resolve(Number.isSafeInteger(exitCode) && exitCode >= 0 ? exitCode : 1);
    };
    child.once("error", () => finish(1));
    child.once("exit", finish);
  });
}

function writeAtomicJson(cwd, relativePath, value) {
  const destination = path.resolve(cwd, relativePath);
  const temporary = `${destination}.tmp-${process.pid}`;
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, destination);
}

export async function runReleaseVerify({
  releaseSha,
  cwd = process.cwd(),
  readHead = () => gitText(cwd, ["rev-parse", "HEAD"]),
  readTrackedStatus = () => gitText(cwd, ["status", "--porcelain", "--untracked-files=no"]),
  npmExecPath = process.env.npm_execpath,
  now = () => new Date().toISOString(),
  runCommand = spawnCommand
}) {
  if (!SHA_PATTERN.test(releaseSha)) throw new Error("release_sha_must_be_lowercase_40_hex");
  if (readHead() !== releaseSha) throw new Error("release_sha_does_not_match_head");
  if (readTrackedStatus() !== "") throw new Error("tracked_files_must_be_clean");
  if (!npmExecPath) throw new Error("npm_execpath_is_required");

  let exitCode = 1;
  try {
    const result = await runCommand(process.execPath, [npmExecPath, "run", "verify"], {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: false
    });
    exitCode = Number.isSafeInteger(result) && result >= 0 ? result : 1;
  } catch {
    exitCode = 1;
  }

  const record = {
    schemaVersion: 1,
    releaseSha,
    recordedAt: now(),
    status: exitCode === 0 ? "passed" : "failed",
    command: "npm run verify",
    exitCode,
    offlineBuild: true
  };
  writeAtomicJson(cwd, RELEASE_INPUT_PATHS.verify, record);
  return record;
}

export function parseArguments(args) {
  if (args.length !== 2 || args[0] !== "--release-sha" || !SHA_PATTERN.test(args[1])) {
    throw new Error("usage: run-release-verify.mjs --release-sha <40-lowercase-hex>");
  }
  return args[1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const record = await runReleaseVerify({ releaseSha: parseArguments(process.argv.slice(2)) });
    if (record.status !== "passed") process.exitCode = 1;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : "release_verify_failed");
    process.exitCode = 1;
  }
}
