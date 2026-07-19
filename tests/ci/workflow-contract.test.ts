import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const workflowPath = path.join(process.cwd(), ".github/workflows/ci.yml");

function workflow(): string {
  return readFileSync(workflowPath, "utf8");
}

describe("secret-free GitHub Actions workflow", () => {
  it("pins the toolchain and runs verify before the offline browser job", () => {
    const source = workflow();

    expect(source).toContain("actions/checkout@v4");
    expect(source).toContain("actions/setup-node@v4");
    expect(source).toMatch(/node-version:\s*["']?22\.14\.0["']?/);
    expect(source.match(/run:\s*npm ci/g)).toHaveLength(2);
    expect(source).toContain("run: npm run verify");
    expect(source).toContain("run: npx playwright install --with-deps chromium");
    expect(source).toContain("run: npm run test:e2e");
    expect(source).toMatch(/browser:[\s\S]*needs:\s*verify/);
    expect(source).toMatch(/if:\s*failure\(\)/);
  });

  it("uses least privilege, cancellation, and no live or secret path", () => {
    const source = workflow();

    expect(source).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(source).toMatch(/concurrency:[\s\S]*cancel-in-progress:\s*true/);
    expect(source).not.toMatch(/\$\{\{\s*secrets\./);
    expect(source).not.toContain("OPENAI_API_KEY");
    expect(source).not.toContain("RUN_LIVE_OPENAI_EVALS");
    expect(source).not.toMatch(/\bdeploy(?:ment)?\b/i);
    expect(source).not.toContain("pull_request_target");
    expect(source).not.toContain("workflow_dispatch");
    expect(source).not.toMatch(/permissions:\s*(?:write-all|write)/);
  });
});
