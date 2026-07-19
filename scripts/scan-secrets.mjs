import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const approvedSyntheticFixtures = new Set(["tests/security/secret-scan.test.ts"]);

const secretPatterns = [
  {
    name: "private-key-header",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i
  },
  {
    name: "common-live-token-prefix",
    pattern:
      /(?:sk_live_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})/
  },
  {
    name: "authorization-bearer-literal",
    pattern: /authorization\s*:\s*bearer\s+[A-Za-z0-9._~+/-]{12,}/i
  },
  {
    name: "credential-assignment",
    pattern:
      /(?:^|[\s"'{,;])(?:[A-Z0-9]+[_-])*(?:API[_-]?KEY|SECRET|PASSWORD|TOKEN)\s*[:=]\s*["'](?!(?:test-key|offline-test-key|synthetic-[A-Za-z0-9-]+|configured-but-must-not-be-used)["'])[^"'\r\n]{8,}["']/im
  }
];

function repositoryFromArguments(args) {
  if (args.length === 0) return process.cwd();
  if (args.length === 2 && args[0] === "--repo" && args[1].trim() !== "") {
    return path.resolve(args[1]);
  }
  throw new Error("Usage: node scripts/scan-secrets.mjs [--repo <path>]");
}

function trackedFiles(repository) {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repository,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return output.toString("utf8").split("\0").filter(Boolean);
}

function readTrackedText(repository, relativePath) {
  const absolutePath = path.resolve(repository, relativePath);
  const repositoryPrefix = `${path.resolve(repository)}${path.sep}`;
  if (!absolutePath.startsWith(repositoryPrefix)) {
    throw new Error(`Tracked path escapes repository: ${relativePath}`);
  }
  const metadata = lstatSync(absolutePath);
  if (!metadata.isFile()) return null;
  const content = readFileSync(absolutePath);
  if (content.includes(0)) return null;
  return content.toString("utf8");
}

function scanRepository(repository) {
  const findings = [];
  trackedFiles(repository).forEach((relativePath) => {
    const normalizedPath = relativePath.split(path.sep).join("/");
    if (approvedSyntheticFixtures.has(normalizedPath)) return;
    const content = readTrackedText(repository, relativePath);
    if (content === null) return;
    secretPatterns.forEach(({ name, pattern }) => {
      if (pattern.test(content)) findings.push({ path: normalizedPath, rule: name });
    });
  });
  return findings;
}

try {
  const repository = repositoryFromArguments(process.argv.slice(2));
  const findings = scanRepository(repository);
  if (findings.length > 0) {
    process.stderr.write(`Secret scan blocked ${findings.length} finding(s):\n`);
    findings.forEach((finding) => {
      process.stderr.write(`- ${finding.path} (${finding.rule})\n`);
    });
    process.exitCode = 1;
  } else {
    process.stdout.write("Secret scan passed for tracked files.\n");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown scanner failure.";
  process.stderr.write(`Secret scan failed safely: ${message}\n`);
  process.exitCode = 1;
}
