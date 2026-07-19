import { expect, test, type Page } from "./offline-test";

import type { AnalyzeClaimResponse } from "../../lib/api/analyze-contract";
import type { ExtractionMetadata } from "../../lib/domain/claim-contract";
import { sourceTransparencyFixture } from "../fixtures/analysis-view-model";
import { runReadyClaim } from "./helpers/claim-driver";
import { mockAnalysis } from "./helpers/mock-analyze";

function responseWithExtraction(extraction: ExtractionMetadata): AnalyzeClaimResponse {
  const response = sourceTransparencyFixture();
  response.result.extraction = extraction;
  return response;
}

function blockedPreflightResponse(): AnalyzeClaimResponse {
  const response = sourceTransparencyFixture();
  response.result = {
    ...response.result,
    status: "unsupported_high_risk",
    primaryScenario: null,
    scenarioIds: [],
    factsUsed: [],
    missingFacts: [],
    factReview: null,
    derivedContext: null,
    policyApplicability: [],
    extraction: {
      performed: false,
      requestedMode: "gpt",
      provider: null,
      model: null,
      notRunReason: "preflight_guard"
    },
    summary: "This request needs support beyond this informational travel claims tool.",
    assessments: [],
    officialSources: [],
    providerCommitments: [],
    similarCases: [],
    scripts: [],
    evidenceStatus: "missing",
    nextActions: []
  };
  return response;
}

async function enableGpt(page: Page, code = "judge-code"): Promise<void> {
  await page.getByLabel("GPT-5.6 Luna").check();
  await page.getByLabel("I understand").check();
  await page.getByLabel("Judge access code").fill(code);
}

test("Local is default and GPT requires privacy acknowledgement plus a code", async ({ page }) => {
  await mockAnalysis(page, sourceTransparencyFixture());
  await page.goto("/");

  const submit = page.getByRole("button", { name: "Analyze claim" });
  await expect(page.getByLabel("Local")).toBeChecked();
  await expect(submit).toBeEnabled();
  await page.getByLabel("GPT-5.6 Luna").check();
  await expect(submit).toBeDisabled();
  await expect(
    page.getByText("Acknowledge privacy and enter the judge code to use GPT.")
  ).toBeVisible();
  await page.getByLabel("I understand").check();
  await expect(submit).toBeDisabled();
  await page.getByLabel("Judge access code").fill("   ");
  await expect(submit).toBeDisabled();
  await page.getByLabel("Judge access code").fill("judge-code");
  await expect(submit).toBeEnabled();

  const stored = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage)
  }));
  expect(JSON.stringify(stored)).not.toContain("judge-code");
  expect(stored).toEqual({ local: [], session: [] });

  await page.getByLabel("Local").check();
  await runReadyClaim(page);
  await expect(page.getByTestId("actual-extraction-badge")).toHaveText("Local");
  await page.getByLabel("GPT-5.6 Luna").check();
  await expect(page.getByLabel("Judge access code")).toHaveValue("judge-code");
});

test("shows the validated OpenAI model that actually ran", async ({ page }) => {
  await mockAnalysis(
    page,
    responseWithExtraction({
      performed: true,
      requestedMode: "gpt",
      provider: "openai",
      model: "gpt-5.6-luna"
    })
  );
  await page.goto("/");
  await enableGpt(page);
  await runReadyClaim(page);

  await expect(page.getByTestId("actual-extraction-badge")).toHaveText("OpenAI · gpt-5.6-luna");
  const stored = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage)
  }));
  expect(JSON.stringify(stored)).not.toContain("judge-code");
});

test("distinguishes a Local fallback and explains it without exposing a raw reason", async ({
  page
}) => {
  await mockAnalysis(
    page,
    responseWithExtraction({
      performed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: "model_timeout"
    })
  );
  await page.goto("/");
  await enableGpt(page);
  await runReadyClaim(page);

  await expect(page.getByTestId("actual-extraction-badge")).toHaveText("Local fallback");
  await expect(page.getByTestId("extraction-explanation")).toHaveText(
    "GPT timed out, so Local extraction completed this request."
  );
  await expect(page.getByText("model_timeout", { exact: true })).toHaveCount(0);
});

test("preflight-blocked high-risk requests report Not run", async ({ page }) => {
  await mockAnalysis(page, blockedPreflightResponse());
  await page.goto("/");
  await enableGpt(page);
  await runReadyClaim(page, "Please represent me in a high-risk legal dispute.");

  const actual = page.getByTestId("actual-extraction");
  await expect(actual.getByTestId("actual-extraction-badge")).toHaveText("Not run");
  await expect(actual).not.toContainText("Local");
  await expect(actual).not.toContainText("OpenAI");
  await expect(actual).toContainText("safety preflight");
});
