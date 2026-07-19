import { expect, test, type Locator, type Page } from "./offline-test";

import type { AnalyzeClaimResponse } from "../../lib/api/analyze-contract";
import type { ScenarioId, WorkflowStatus } from "../../lib/domain/claim-contract";
import { sourceTransparencyFixture } from "../fixtures/analysis-view-model";
import { runReadyClaim } from "./helpers/claim-driver";
import { mockAnalysis } from "./helpers/mock-analyze";

const readyJourneys: Array<{ name: string; scenarioId: ScenarioId }> = [
  { name: "Marriott walk", scenarioId: "marriott_hotel_walk" },
  { name: "US controllable cancellation", scenarioId: "us_airline_disruption" },
  { name: "US denied boarding", scenarioId: "us_denied_boarding" },
  { name: "EU/UK cancellation", scenarioId: "eu_uk_air_disruption" }
];

function readyResponse(scenarioId: ScenarioId): AnalyzeClaimResponse {
  const response = sourceTransparencyFixture();
  response.result.status = "ready";
  response.result.primaryScenario = scenarioId;
  response.result.scenarioIds = [scenarioId];
  response.result.summary =
    "The available facts support a condition-level assessment of the active travel claim scenarios.";
  return response;
}

function blockedResponse(
  status: Extract<WorkflowStatus, "out_of_scope" | "unsupported_high_risk">
) {
  const response = sourceTransparencyFixture();
  response.result = {
    ...response.result,
    status,
    primaryScenario: null,
    scenarioIds: [],
    factsUsed: [],
    missingFacts: [],
    factReview: null,
    derivedContext: null,
    policyApplicability: [],
    summary:
      status === "out_of_scope"
        ? "This request is outside the supported travel claim scenarios."
        : "This request needs support beyond this informational travel claims tool.",
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

async function expectExplanationStructure(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Facts used" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matched conditions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Missing conditions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Policy applicability" })).toBeVisible();
  await Promise.all(
    ["Operating-carrier region", "EU261 applicability", "UK261 applicability", "Legal regimes"].map(
      (label) => expect(page.getByText(label, { exact: true })).toBeVisible()
    )
  );
  await expect(
    page.getByText("Informational guidance only — not legal advice or a promise of compensation.")
  ).toBeVisible();
  await expect(page.getByTestId("primary-next-action")).toHaveCount(1);
  await expect(page.getByText("Claim strength", { exact: true })).toHaveCount(0);
}

readyJourneys.forEach((journey) => {
  test(`${journey.name} shows facts, remedies, evidence, sources, and one next action`, async ({
    page
  }) => {
    await mockAnalysis(page, readyResponse(journey.scenarioId));
    await page.goto("/");
    await runReadyClaim(page);

    await expectExplanationStructure(page);
    await expect(page.getByText("Conservative", { exact: true })).toBeVisible();
    await expect(page.getByText("Standard", { exact: true })).toBeVisible();
    await expect(page.getByText("Assertive", { exact: true })).toBeVisible();

    const promotedSourceHeading = page.locator("#policy-source-united-policy");
    await expect(promotedSourceHeading).toHaveCount(1);
    const groundedLink = page.getByRole("link", {
      name: "Grounded in United customer service plan"
    });
    await expect(groundedLink).toBeVisible();
    await expect(groundedLink).toHaveAttribute("href", "#policy-source-united-policy");
    await expect(page.getByText("united-policy", { exact: true })).toHaveCount(0);
  });
});

test("needs-information results keep explanations and exactly one next action", async ({
  page
}) => {
  await mockAnalysis(page, sourceTransparencyFixture());
  await page.goto("/");
  await runReadyClaim(page);

  await expectExplanationStructure(page);
  await expect(
    page
      .getByRole("article", { name: "Overnight hotel commitment" })
      .getByText("Conditional — review missing facts", { exact: true })
      .first()
  ).toBeVisible();
});

(["out_of_scope", "unsupported_high_risk"] as const).forEach((status) => {
  test(`${status} reveals no ordinary claim analysis`, async ({ page }) => {
    await mockAnalysis(page, blockedResponse(status));
    await page.goto("/");
    await runReadyClaim(page);

    await expect(page.getByTestId("analysis-result-heading")).toBeFocused();
    await expect(page.getByRole("button", { name: "Review facts" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Server-derived context" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Policy applicability" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Rights and request options" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Claim scripts" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Official sources" })).toHaveCount(0);
    await expect(page.getByText("Conservative", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("article")).toHaveCount(0);
  });
});

test("copy failure is announced without losing the script text", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("clipboard_denied")) }
    });
  });
  await mockAnalysis(page, readyResponse("us_airline_disruption"));
  await page.goto("/");
  await runReadyClaim(page);

  const copyButton = page.getByRole("button", {
    name: "Copy Use after a controllable United cancellation with documented expenses."
  });
  await copyButton.click();
  await expect(page.getByRole("status")).toHaveText("Copy failed — select the text manually");
  await expect(
    page.getByText(
      "Please review my documented expenses under your published customer service plan."
    )
  ).toBeVisible();
});

async function tabTo(page: Page, target: Locator, limit = 80): Promise<void> {
  if (limit <= 0) throw new Error("keyboard_target_not_reached");
  await page.keyboard.press("Tab");
  if (await target.evaluate((element) => element === document.activeElement)) return;
  await tabTo(page, target, limit - 1);
}

test("keyboard flow reaches review, source citation, copy, and reset", async ({ page }) => {
  await mockAnalysis(page, readyResponse("us_airline_disruption"));
  await page.goto("/");

  const intake = page.getByTestId("claim-message");
  await tabTo(page, intake);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("My anonymous flight was cancelled after a crew issue.");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("analysis-result-heading")).toBeFocused();
  const reviewButton = page.getByRole("button", { name: "Review facts" });
  await tabTo(page, reviewButton);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Editable raw facts" })).toBeVisible();
  await tabTo(page, page.getByTestId("fact-origin.city"));
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("London");
  await tabTo(page, page.getByRole("button", { name: "Cancel fact review" }));
  await page.keyboard.press("Enter");

  const sourceLink = page.getByRole("link", { name: "Grounded in United customer service plan" });
  await tabTo(page, sourceLink);
  await expect(sourceLink).toBeFocused();
  const copyButton = page.getByRole("button", {
    name: "Copy Use after a controllable United cancellation with documented expenses."
  });
  await tabTo(page, copyButton);
  await expect(copyButton).toBeFocused();
  const resetButton = page.getByRole("button", { name: "New claim" });
  await tabTo(page, resetButton);
  await page.keyboard.press("Enter");
  await expect(intake).toBeFocused();
});
