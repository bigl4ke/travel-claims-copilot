import { pathToFileURL } from "node:url";

import { loadKnowledgeSnapshot } from "../lib/knowledge/load-knowledge";
import {
  parseKnowledgeSnapshot,
  type RawKnowledgeSnapshot
} from "../lib/knowledge/knowledge-schema";

export function validateKnowledgeData(raw: RawKnowledgeSnapshot, asOf: string) {
  return parseKnowledgeSnapshot(raw, { asOf });
}

async function main(): Promise<void> {
  const snapshot = await loadKnowledgeSnapshot();
  const statusCounts = Object.fromEntries(
    ["approved", "needs_review", "excluded"].map((status) => [
      status,
      snapshot.cases.filter((item) => item.review_status === status).length
    ])
  );
  process.stdout.write(
    `Validated ${snapshot.policies.length} policies, ${snapshot.cases.length} cases (${Object.entries(
      statusCounts
    )
      .map(([status, count]) => `${count} ${status}`)
      .join(", ")}), ${snapshot.scripts.length} scripts, and ${
      snapshot.carrierCommitments.length
    } carrier commitments. Version ${snapshot.version}.\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
