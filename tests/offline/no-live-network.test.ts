import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readProjectFile(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("normal-suite offline composition", () => {
  it("requires every browser specification to use the offline fixture", () => {
    const e2eDirectory = path.join(process.cwd(), "tests", "e2e");
    const specifications = readdirSync(e2eDirectory)
      .filter((file) => file.endsWith(".spec.ts"))
      .sort();

    expect(specifications.length).toBeGreaterThan(0);
    specifications.forEach((file) => {
      const source = readFileSync(path.join(e2eDirectory, file), "utf8");
      expect(source, file).toMatch(/from "\.\/offline-test";/);
      expect(source, file).not.toMatch(/from "@playwright\/test";/);
    });
  });

  it("forces Playwright to start a fresh offline server", () => {
    const config = readProjectFile("playwright.config.ts");

    expect(config).toContain('command: "npm run dev:offline"');
    expect(config).toContain("reuseExistingServer: false");
  });

  it("uses the offline build in the verification chain", () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["dev:offline"]).toBe("node scripts/run-offline-next.mjs dev");
    expect(packageJson.scripts["build:offline"]).toBe("node scripts/run-offline-next.mjs build");
    expect(packageJson.scripts["test:offline"]).toBe(
      "vitest run --config vitest.config.ts tests/offline"
    );
    expect(packageJson.scripts.verify).toContain("npm run build:offline");
    expect(packageJson.scripts.verify).not.toMatch(/(?:npm run build|next build)(?:\s|$)/);
  });

  it("defines a fail-closed browser route fixture", () => {
    const fixture = readProjectFile("tests/e2e/offline-test.ts");

    expect(fixture).toContain('page.route("**/*"');
    expect(fixture).toContain('url.hostname === "127.0.0.1"');
    expect(fixture).toContain('url.hostname === "localhost"');
    expect(fixture).toContain('route.abort("blockedbyclient")');
    expect(fixture).toContain("Offline E2E blocked non-loopback request");
  });
});
