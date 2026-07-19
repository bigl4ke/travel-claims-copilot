import { expect, test, type Locator, type Page } from "./offline-test";

import type { AnalyzeClaimResponse } from "../../lib/api/analyze-contract";
import { sourceTransparencyFixture } from "../fixtures/analysis-view-model";
import { analyzeResponseFixture } from "../fixtures/analyze-transport";
import { runReadyClaim } from "./helpers/claim-driver";
import { mockAnalysis } from "./helpers/mock-analyze";

async function tabTo(page: Page, target: Locator, limit = 160): Promise<void> {
  if (limit <= 0) throw new Error("keyboard_target_not_reached");
  await page.keyboard.press("Tab");
  if (await target.evaluate((element) => element === document.activeElement)) return;
  await tabTo(page, target, limit - 1);
}

function responseAt(baseRevision: number, revision: number): AnalyzeClaimResponse {
  const response = analyzeResponseFixture();
  response.baseRevision = baseRevision;
  response.claimState.revision = revision;
  response.result.factsRevision = revision;
  return response;
}

test("GPT alone requires consent and keeps the access code in memory only", async ({ page }) => {
  await mockAnalysis(page, sourceTransparencyFixture());
  await page.goto("/");

  const submit = page.getByRole("button", { name: "Analyze claim" });
  await expect(page.getByLabel("Local")).toBeChecked();
  await expect(submit).toBeEnabled();
  await page.getByLabel("GPT-5.6 Luna").check();
  await expect(submit).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText(
    "Acknowledge privacy and enter the judge code to use GPT."
  );
  await page.getByLabel("I understand").check();
  await page.getByLabel("Judge access code").fill("memory-only-code");
  await expect(submit).toBeEnabled();

  const browserState = await page.evaluate(() => ({
    href: window.location.href,
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage)
  }));
  expect(JSON.stringify(browserState)).not.toContain("memory-only-code");
  expect(browserState.local).toEqual([]);
  expect(browserState.session).toEqual([]);
});

test("all six source classes remain visibly separated", async ({ page }) => {
  await mockAnalysis(page, sourceTransparencyFixture());
  await page.goto("/");
  await runReadyClaim(page);

  await Promise.all(
    [
      "Government regulation",
      "Regulatory guidance",
      "Provider commitment",
      "Community report",
      "User report",
      "Synthetic example"
    ].map((label) => expect(page.getByText(label, { exact: true }).first()).toBeVisible())
  );
});

test("keyboard-only correction returns focus to the revised result", async ({ page }) => {
  await mockAnalysis(page, [
    { response: responseAt(0, 1) },
    {
      response: responseAt(1, 2),
      assertRequest: (request) => {
        expect(request).toMatchObject({
          message: "",
          baseRevision: 1,
          correction: { set: { "origin.city": "London" } }
        });
      }
    }
  ]);
  await page.goto("/");

  const intake = page.getByTestId("claim-message");
  await tabTo(page, intake);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("My anonymous flight was cancelled after a crew issue.");
  await tabTo(page, page.getByRole("button", { name: "Analyze claim" }));
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("analysis-result-heading")).toBeFocused();

  await tabTo(page, page.getByRole("button", { name: "Review facts" }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByTestId("fact-origin.city"));
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("London");
  await tabTo(page, page.getByRole("button", { name: "Save corrected facts" }));
  await page.keyboard.press("Enter");

  await expect(page.getByText(/facts revision 2/)).toBeVisible();
  await expect(page.getByTestId("analysis-result-heading")).toBeFocused();
});
