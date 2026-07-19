import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import type { AnalyzeClaimResponse } from "../lib/api/analyze-contract";
import { analyzeResponseFixture } from "./fixtures/analyze-transport";

describe("temporary page compatibility", () => {
  it("compiles the render entry against the public analyze transport fixture", () => {
    const pagePath = join(process.cwd(), "app/page.tsx");
    const pageSource = readFileSync(pagePath, "utf8");
    const compiled = ts.transpileModule(pageSource, {
      fileName: pagePath,
      reportDiagnostics: true,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022
      }
    });
    const errors = (compiled.diagnostics ?? [])
      .filter(({ category }) => category === ts.DiagnosticCategory.Error)
      .map(({ messageText }) => ts.flattenDiagnosticMessageText(messageText, "\n"));
    const response = analyzeResponseFixture() satisfies AnalyzeClaimResponse;

    expect(errors).toEqual([]);
    expect(compiled.outputText).toContain("pageResultFromResponse");
    expect(pageSource).toContain("import type { AnalyzeClaimResponse }");
    expect(pageSource).not.toContain("AnalyzeClaimDomainResponse");
    expect(Object.keys(response).sort()).toEqual(["baseRevision", "claimState", "result"]);
    expect(response.result).toEqual(
      expect.objectContaining({
        officialSources: expect.any(Array),
        providerCommitments: expect.any(Array),
        similarCases: expect.any(Array),
        scripts: expect.any(Array)
      })
    );
  });
});
