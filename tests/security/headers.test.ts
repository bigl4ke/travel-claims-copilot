import { execFileSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { POST as analyzePost } from "../../app/api/analyze/route";
import { POST as intakePost } from "../../app/api/intake/route";
import { toCaughtApiErrorResponse } from "../../lib/api/api-response";
// @ts-expect-error The JavaScript Next configuration has no declaration file.
import nextConfig, { contentSecurityPolicy } from "../../next.config.mjs";

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

function headerMap(rule: HeaderRule): Map<string, string> {
  return new Map(rule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

describe("release response headers", () => {
  it("permits Next evaluation only in development", () => {
    expect(contentSecurityPolicy("development")).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy("production")).not.toContain("'unsafe-eval'");
    expect(contentSecurityPolicy("test")).not.toContain("'unsafe-eval'");
  });

  it("defines the static browser policy and API no-store policy", async () => {
    const rules = (await nextConfig.headers()) as HeaderRule[];
    const browserRule = rules.find(({ source }) => source === "/:path*");
    const apiRule = rules.find(({ source }) => source === "/api/:path*");

    expect(browserRule).toBeDefined();
    expect(apiRule).toBeDefined();

    const browserHeaders = headerMap(browserRule as HeaderRule);
    const apiHeaders = headerMap(apiRule as HeaderRule);
    const cspHeader = browserHeaders.get("content-security-policy") ?? "";

    expect(browserHeaders.get("x-content-type-options")).toBe("nosniff");
    expect(browserHeaders.get("referrer-policy")).toBe("no-referrer");
    expect(browserHeaders.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=()"
    );
    expect(browserHeaders.get("x-frame-options")).toBe("DENY");
    expect(cspHeader).toContain("default-src 'self'");
    expect(cspHeader).toContain("script-src 'self' 'unsafe-inline'");
    expect(cspHeader).toContain("style-src 'self' 'unsafe-inline'");
    expect(cspHeader).toContain("img-src 'self' data:");
    expect(cspHeader).toContain("connect-src 'self'");
    expect(cspHeader).toContain("object-src 'none'");
    expect(cspHeader).toContain("frame-ancestors 'none'");
    expect(cspHeader).toContain("base-uri 'self'");
    expect(cspHeader).toContain("form-action 'self'");
    expect(cspHeader).not.toContain("unsafe-eval");
    expect(apiHeaders.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["analyze", analyzePost],
    ["intake", intakePost]
  ] as const)("rejects non-JSON %s POSTs without caching the error", async (route, post) => {
    const response = await post(
      new Request(`http://localhost/api/${route}`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not-json"
      })
    );

    expect(response.status).toBe(415);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unsupported_media_type" }
    });
  });

  it("does not serialize production exception details", async () => {
    const privateMarker = "private-production-exception-marker";
    const error = new Error(privateMarker, { cause: new Error(privateMarker) });
    Object.assign(error, { stack: privateMarker, details: privateMarker });

    const response = toCaughtApiErrorResponse(error, "req-security-001");
    const serialized = await response.text();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(serialized).not.toContain(privateMarker);
    expect(serialized).not.toContain("stack");
    expect(serialized).not.toContain("cause");
  });
});

describe("tracked repository hygiene", () => {
  it("tracks no local secret files or generated output", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], {
      cwd: process.cwd(),
      encoding: "utf8"
    })
      .split("\0")
      .filter(Boolean);
    const forbidden = tracked.filter((file) => {
      const segments = file.split("/");
      const basename = path.basename(file);
      return (
        basename === ".DS_Store" ||
        (basename.startsWith(".env") && basename !== ".env.example") ||
        segments.some((segment) =>
          [".next", "coverage", "playwright-report", "test-results", ".release"].includes(segment)
        )
      );
    });

    expect(forbidden).toEqual([]);
  });
});
