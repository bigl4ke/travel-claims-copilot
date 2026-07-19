import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error The production runner is intentionally a Node ESM module.
import { runE2eRehearsals } from "../../scripts/run-e2e-rehearsals.mjs";

const releaseSha = "1234567890abcdef1234567890abcdef12345678";
const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "e2e-rehearsal-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

function jsonReport(expected: number, unexpected = 0, flaky = 0): Buffer {
  return Buffer.from(
    JSON.stringify({
      config: {},
      suites: [],
      errors: [],
      stats: { expected, unexpected, flaky, skipped: 0 }
    })
  );
}

describe("three-run E2E rehearsal runner", () => {
  it("spawns sequentially with unique absolute outputs and hashes exact report bytes", async () => {
    const cwd = temporaryDirectory();
    const invocations: Array<{
      activeAtSpawn: number;
      command: string;
      args: string[];
      options: { env: NodeJS.ProcessEnv; shell: boolean };
    }> = [];
    let activeChildren = 0;
    const reports = [jsonReport(21), jsonReport(22), jsonReport(23)];

    const spawnChild = (command: string, args: string[], options: never) => {
      const typedOptions = options as { env: NodeJS.ProcessEnv; shell: boolean };
      invocations.push({ activeAtSpawn: activeChildren, command, args, options: typedOptions });
      activeChildren += 1;
      const child = new EventEmitter();
      const report = reports[invocations.length - 1];
      writeFileSync(typedOptions.env.PLAYWRIGHT_JSON_OUTPUT as string, report);
      queueMicrotask(() => {
        activeChildren -= 1;
        child.emit("exit", 0);
      });
      return child;
    };

    const manifest = await runE2eRehearsals({
      releaseSha,
      cwd,
      spawnChild,
      readHead: () => releaseSha,
      readTrackedStatus: () => "",
      now: () => "2026-07-20T00:00:00.000Z",
      npmExecPath: "/test/npm-cli.js"
    });

    expect(invocations).toHaveLength(3);
    expect(invocations.map(({ activeAtSpawn }) => activeAtSpawn)).toEqual([0, 0, 0]);
    expect(invocations.map(({ options }) => options.shell)).toEqual([false, false, false]);
    expect(
      invocations.map(({ command }) => command).every((item) => item === process.execPath)
    ).toBe(true);
    expect(invocations.map(({ args }) => args)).toEqual([
      ["/test/npm-cli.js", "run", "test:e2e"],
      ["/test/npm-cli.js", "run", "test:e2e"],
      ["/test/npm-cli.js", "run", "test:e2e"]
    ]);
    const outputPaths = invocations.map(({ options }) => options.env.PLAYWRIGHT_JSON_OUTPUT);
    expect(outputPaths.every((item) => typeof item === "string" && path.isAbsolute(item))).toBe(
      true
    );
    expect(new Set(outputPaths).size).toBe(3);
    expect(manifest.runs.map(({ sha256 }: { sha256: string }) => sha256)).toEqual(
      reports.map((bytes) => createHash("sha256").update(bytes).digest("hex"))
    );
    expect(manifest.runs.every(({ status }: { status: string }) => status === "passed")).toBe(true);
    expect(JSON.parse(readFileSync(path.join(cwd, ".release/e2e/manifest.json"), "utf8"))).toEqual(
      manifest
    );
  });

  it("runs all three, writes the manifest, and fails closed on malformed output", async () => {
    const cwd = temporaryDirectory();
    let invocation = 0;
    const spawnChild = (_command: string, _args: string[], options: never) => {
      invocation += 1;
      const child = new EventEmitter();
      const output = (options as { env: NodeJS.ProcessEnv }).env.PLAYWRIGHT_JSON_OUTPUT as string;
      writeFileSync(output, invocation === 2 ? Buffer.from("not-json") : jsonReport(2));
      queueMicrotask(() => child.emit("exit", 0));
      return child;
    };

    await expect(
      runE2eRehearsals({
        releaseSha,
        cwd,
        spawnChild,
        readHead: () => releaseSha,
        readTrackedStatus: () => "",
        npmExecPath: "/test/npm-cli.js"
      })
    ).rejects.toThrow();
    expect(invocation).toBe(3);
    const manifest = JSON.parse(
      readFileSync(path.join(cwd, ".release/e2e/manifest.json"), "utf8")
    ) as { runs: Array<{ status: string }> };
    expect(manifest.runs.map(({ status }) => status)).toEqual(["passed", "failed", "passed"]);
  });
});
