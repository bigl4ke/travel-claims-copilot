import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const scannerPath = path.join(process.cwd(), "scripts", "scan-secrets.mjs");

function createIndexedRepository(content: string): string {
  const repository = mkdtempSync(path.join(tmpdir(), "claims-secret-scan-"));
  execFileSync("git", ["init", "--quiet"], { cwd: repository });
  writeFileSync(path.join(repository, "candidate.txt"), content, "utf8");
  execFileSync("git", ["add", "candidate.txt"], { cwd: repository });
  return repository;
}

function runScanner(repository: string) {
  return spawnSync(process.execPath, [scannerPath, "--repo", repository], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
}

describe("tracked-file secret scanner", () => {
  it("passes the current tracked repository", () => {
    const result = runScanner(process.cwd());

    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Secret scan passed");
  });

  it("passes an indexed repository with ordinary public content", () => {
    const repository = createIndexedRepository("A synthetic public travel-claim fixture.\n");
    try {
      const result = runScanner(repository);

      expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  });

  it("permits an explicitly marked synthetic credential fixture", () => {
    const content = ["OPENAI", "_API", "_KEY", ': "', "synthetic-fixture-key", '"'].join("");
    const repository = createIndexedRepository(content);
    try {
      const result = runScanner(repository);

      expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  });

  it.each([
    [
      "private key header",
      ["-----BEGIN ", "PRIVATE", " KEY-----", "\nsynthetic-material"].join("")
    ],
    ["live-token prefix", ["g", "hp_", "A".repeat(24)].join("")],
    [
      "authorization bearer literal",
      ["Authorization", ": ", "Bearer", " ", "syntheticBearerValue123"].join("")
    ],
    [
      "high-confidence assignment",
      ["SERVICE", "_API", "_KEY", '="', "syntheticAssignedValue123", '"'].join("")
    ]
  ])("rejects a tracked %s without echoing its content", (_label, content) => {
    const repository = createIndexedRepository(content);
    try {
      const result = runScanner(repository);
      const output = `${result.stdout}${result.stderr}`;

      expect(result.status).toBe(1);
      expect(output).toContain("candidate.txt");
      expect(output).not.toContain(content);
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  });
});
