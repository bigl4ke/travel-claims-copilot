import { expect, test } from "./offline-test";

import { syntheticOnlyFixture } from "../fixtures/analysis-view-model";
import { runReadyClaim } from "./helpers/claim-driver";
import { mockAnalysis } from "./helpers/mock-analyze";

test("synthetic status is adjacent to its outcome", async ({ page }) => {
  await mockAnalysis(page, syntheticOnlyFixture());
  await page.goto("/");
  await runReadyClaim(page);

  const card = page.getByRole("article", { name: "Synthetic overnight cancellation" });
  await expect(card.getByText("Synthetic example", { exact: true })).toBeVisible();
  await expect(
    card.getByText("Illustrative outcome — not a reported user result", { exact: true })
  ).toBeVisible();
  await expect(card.getByRole("link")).toHaveCount(0);
});
