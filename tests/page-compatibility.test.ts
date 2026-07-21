import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("home page composition", () => {
  it("uses the action-first guided intake as the public page", () => {
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

    expect(errors).toEqual([]);
    expect(compiled.outputText).toContain("Move the trip forward.");
    expect(pageSource).toContain('"use client"');
    expect(pageSource).toContain('const [draft, setDraft] = useState("")');
    expect(pageSource).toContain("ActionWorkspace");
    expect(pageSource).not.toContain("SuggestedAsksPanel");
    expect(pageSource).not.toContain("PolicySection");
  });
});
