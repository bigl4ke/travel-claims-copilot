import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.argv.includes("--network-approved")) {
  throw new Error(
    "Network approval is required. Re-run with --network-approved only after a human approves source checks."
  );
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(projectRoot, relativePath), "utf8"));
}

const [policies, carrierCommitments] = await Promise.all([
  readJson("data/policies.json"),
  readJson("data/carrier-commitments.json")
]);
const sources = [
  ...policies.map((policy) => ({ id: policy.policy_id, url: policy.source_url })),
  ...carrierCommitments.map((commitment) => ({
    id: commitment.commitment_id,
    url: commitment.source_url
  }))
];

const results = await Promise.all(
  sources.map(async (source) => {
    try {
      const response = await fetch(source.url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(10_000)
      });
      return { ok: response.ok, output: `${source.id}\t${response.status}\t${response.url}\n` };
    } catch (error) {
      return {
        ok: false,
        error: `${source.id}\tERROR\t${error instanceof Error ? error.message : String(error)}\n`
      };
    }
  })
);

results.forEach((result) => {
  if (result.output) process.stdout.write(result.output);
  if (result.error) process.stderr.write(result.error);
});

if (results.some((result) => !result.ok)) process.exitCode = 1;
