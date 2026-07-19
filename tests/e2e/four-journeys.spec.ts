import { expect, test } from "./offline-test";

import { goldenJourneys } from "../fixtures/e2e-journeys";
import { correctFacts, runReadyClaim } from "./helpers/claim-driver";

test("defines the four frozen browser journeys", async () => {
  expect(goldenJourneys).toHaveLength(4);
});

goldenJourneys.forEach((journey) => {
  test(`${journey.name} completes the real Local workflow`, async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Local")).toBeChecked();
    await runReadyClaim(page, journey.message);
    await correctFacts(page, journey.corrections);

    await expect(page.getByTestId("analysis-result-heading")).toBeFocused();
    await expect(page.getByText(/Assessment ready · facts revision 2/)).toBeVisible();
    const scenarioSection = page.getByRole("heading", { name: "Active scenarios" }).locator("..");
    await expect(scenarioSection.locator("li")).toHaveText(journey.expectedScenarios);

    await Promise.all(
      journey.expectedRemedies.map(async ({ title, status }) => {
        const article = page.getByRole("article", { name: title });
        await expect(article).toBeVisible();
        await expect(article.getByText(status, { exact: true }).first()).toBeVisible();
      })
    );
    await expect(page.getByRole("heading", { name: "Official sources" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Provider commitments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reviewed cases" })).toBeVisible();
  });
});
