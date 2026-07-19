import { expect, test } from "./offline-test";

import { sourceTransparencyFixture } from "../fixtures/analysis-view-model";
import { runReadyClaim } from "./helpers/claim-driver";
import { mockAnalysis } from "./helpers/mock-analyze";

test("labels every source class and preserves provenance", async ({ page }) => {
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

  await expect(page.getByText("Last checked", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Applicable conditions", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Regulation (EC) No 261/2004 source" })
  ).toHaveAttribute("rel", "noopener noreferrer");
  await expect(
    page.getByRole("article", { name: "Synthetic overnight cancellation" }).getByRole("link")
  ).toHaveCount(0);
});
