import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "./offline-test";

import type { AnalyzeClaimResponse } from "../../lib/api/analyze-contract";
import type { FactConflict } from "../../lib/domain/claim-contract";
import { sourceTransparencyFixture } from "../fixtures/analysis-view-model";
import { analyzeResponseFixture } from "../fixtures/analyze-transport";
import type { DeepPartial } from "../fixtures/raw-claims";
import { runReadyClaim } from "./helpers/claim-driver";
import { mockAnalysis } from "./helpers/mock-analyze";

function responseAt(
  baseRevision: number,
  revision: number,
  overrides: DeepPartial<AnalyzeClaimResponse> = {}
): AnalyzeClaimResponse {
  const response = analyzeResponseFixture(overrides);
  response.baseRevision = baseRevision;
  response.claimState.revision = revision;
  response.result.factsRevision = revision;
  return response;
}

test("offers three bounded actions without free text or a feedback request", async ({ page }) => {
  let feedbackRequests = 0;
  await page.route(
    (url) => url.pathname === "/api/feedback",
    async (route) => {
      feedbackRequests += 1;
      await route.abort("blockedbyclient");
    }
  );
  await mockAnalysis(page, sourceTransparencyFixture());
  await page.goto("/");
  await runReadyClaim(page);

  const panel = page.getByRole("region", { name: "Session feedback" });
  await expect(panel.getByLabel("Helpful")).toBeVisible();
  await expect(panel.getByLabel("Fact is wrong")).toBeVisible();
  await expect(panel.getByLabel("Source mismatch")).toBeVisible();
  await expect(panel.locator('input[type="text"], textarea')).toHaveCount(0);
  await panel.getByLabel("Source mismatch").check();
  await panel.getByLabel("united-policy").check();
  await panel.getByRole("button", { name: "Save feedback in this session" }).click();
  await expect(panel).toContainText("1 feedback record saved in this session.");
  expect(feedbackRequests).toBe(0);
});

test("a revision clears the draft but preserves submitted records", async ({ page }) => {
  const first = responseAt(0, 1);
  const second = responseAt(1, 2, {
    claimState: { facts: { origin: { city: "London" } } },
    result: {
      factReview: { facts: { origin: { city: "London" } } },
      extraction: {
        performed: false,
        requestedMode: "local",
        provider: null,
        model: null,
        notRunReason: "correction_only"
      }
    }
  });
  await mockAnalysis(page, [
    { response: first },
    {
      response: second,
      assertRequest: (request) => {
        expect(request).toMatchObject({ message: "", baseRevision: 1 });
      }
    }
  ]);
  await page.goto("/");
  await runReadyClaim(page);

  const panel = page.getByRole("region", { name: "Session feedback" });
  await panel.getByLabel("Helpful").check();
  await panel.getByRole("button", { name: "Save feedback in this session" }).click();
  await panel.getByLabel("Source mismatch").check();
  await panel.getByLabel("united-policy").check();

  await page.getByRole("button", { name: "Review facts" }).click();
  await page.getByTestId("fact-origin.city").fill("London");
  await page.getByRole("button", { name: "Save corrected facts" }).click();
  await expect(page.getByTestId("analysis-result-heading")).toBeFocused();

  const updatedPanel = page.getByRole("region", { name: "Session feedback" });
  await expect(updatedPanel).toContainText("1 feedback record saved in this session.");
  await expect(updatedPanel.getByLabel("Helpful")).not.toBeChecked();
  await expect(updatedPanel.getByLabel("Source mismatch")).not.toBeChecked();
  await expect(updatedPanel.getByLabel("united-policy")).toHaveCount(0);
});

test("explicit download excludes the prior GPT code and forbidden fields", async ({ page }) => {
  const response = sourceTransparencyFixture();
  response.result.extraction = {
    performed: true,
    requestedMode: "gpt",
    provider: "openai",
    model: "gpt-5.6-luna"
  };
  let feedbackRequests = 0;
  await page.route(
    (url) => url.pathname === "/api/feedback",
    async (route) => {
      feedbackRequests += 1;
      await route.abort("blockedbyclient");
    }
  );
  await mockAnalysis(page, response);
  await page.goto("/");
  await page.getByLabel("GPT-5.6 Luna").check();
  await page.getByLabel("I understand").check();
  await page.getByLabel("Judge access code").fill("judge-code-private");
  await runReadyClaim(page);

  const panel = page.getByRole("region", { name: "Session feedback" });
  await panel.getByLabel("Helpful").check();
  await panel.getByRole("button", { name: "Save feedback in this session" }).click();
  const downloadPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download feedback JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("travel-claims-feedback.json");
  const path = await download.path();
  if (!path) throw new Error("feedback_download_path_missing");
  const json = await readFile(path, "utf8");

  expect(JSON.parse(json)).toMatchObject({
    schemaVersion: 1,
    records: [{ feedback: { kind: "helpful" } }]
  });
  ["judge-code-private", "accessCode", "message", "rawFacts", "ticketNumber"].forEach((forbidden) =>
    expect(json).not.toContain(forbidden)
  );
  expect(feedbackRequests).toBe(0);
});

async function tabTo(page: Page, target: Locator, limit = 160): Promise<void> {
  if (limit <= 0) throw new Error("keyboard_target_not_reached");
  await page.keyboard.press("Tab");
  if (await target.evaluate((element) => element === document.activeElement)) return;
  await tabTo(page, target, limit - 1);
}

test("keyboard flow covers private model use, correction, sources, feedback, download, and reset", async ({
  page
}) => {
  const conflict: FactConflict = {
    field: "deniedBoardingKind",
    candidates: [
      { value: "voluntary", source: "deterministic_extraction" },
      { value: "involuntary", source: "openai_extraction" }
    ]
  };
  const first = responseAt(0, 1, {
    claimState: { conflicts: [conflict], unresolvedFields: ["deniedBoardingKind"] },
    result: {
      extraction: {
        performed: true,
        requestedMode: "gpt",
        provider: "openai",
        model: "gpt-5.6-luna"
      },
      factReview: {
        conflicts: [
          {
            path: "deniedBoardingKind",
            label: "deniedBoardingKind",
            candidates: conflict.candidates
          }
        ],
        unresolvedFields: ["deniedBoardingKind"]
      }
    }
  });
  const second = responseAt(1, 2, {
    claimState: {
      facts: { origin: { city: "London" } },
      conflicts: [],
      unresolvedFields: []
    },
    result: {
      extraction: {
        performed: false,
        requestedMode: "gpt",
        provider: null,
        model: null,
        notRunReason: "correction_only"
      },
      factReview: {
        facts: { origin: { city: "London" } },
        conflicts: [],
        unresolvedFields: []
      }
    }
  });
  await mockAnalysis(page, [
    {
      response: first,
      assertRequest: (request) => {
        expect(request).toMatchObject({ requestedMode: "gpt", privacyAcknowledged: true });
      }
    },
    {
      response: second,
      assertRequest: (request) => {
        expect(request).toMatchObject({ message: "", baseRevision: 1, requestedMode: "gpt" });
      }
    }
  ]);
  await page.goto("/");

  await tabTo(page, page.getByLabel("Local"));
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("GPT-5.6 Luna")).toBeChecked();
  await tabTo(page, page.getByLabel("I understand"));
  await page.keyboard.press("Space");
  await tabTo(page, page.getByLabel("Judge access code"));
  await page.keyboard.type("keyboard-judge-code");
  const intake = page.getByTestId("claim-message");
  await tabTo(page, intake);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("My anonymous United flight was cancelled after a crew issue.");
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
  await expect(page.getByTestId("analysis-result-heading")).toBeFocused();

  const sourceLink = page.getByRole("link", { name: "Grounded in United customer service plan" });
  await tabTo(page, sourceLink);
  await expect(sourceLink).toBeFocused();
  const copyButton = page.getByRole("button", {
    name: "Copy Use after a controllable United cancellation with documented expenses."
  });
  await tabTo(page, copyButton);
  await page.keyboard.press("Enter");

  const helpful = page.getByRole("region", { name: "Session feedback" }).getByLabel("Helpful");
  await tabTo(page, helpful);
  await page.keyboard.press("Space");
  const save = page.getByRole("button", { name: "Save feedback in this session" });
  await tabTo(page, save);
  await page.keyboard.press("Enter");
  const downloadButton = page.getByRole("button", { name: "Download feedback JSON" });
  await tabTo(page, downloadButton);
  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  await downloadPromise;

  const resetButton = page.getByRole("button", { name: "New claim" });
  await tabTo(page, resetButton);
  await page.keyboard.press("Enter");
  await expect(intake).toBeFocused();
});
