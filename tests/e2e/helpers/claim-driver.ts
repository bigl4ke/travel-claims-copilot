import { expect, type Page } from "@playwright/test";

import type { RawFactPath } from "../../../lib/domain/claim-contract";

const DEFAULT_CLAIM_MESSAGE =
  "My flight was cancelled, and I arrived the next day after paying for a hotel.";

export async function runReadyClaim(page: Page, message = DEFAULT_CLAIM_MESSAGE): Promise<void> {
  await page.getByTestId("claim-message").fill(message);
  await page.getByRole("button", { name: "Analyze claim" }).click();
  const result = page.getByTestId("analysis-result");
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute("aria-busy", "false");
}

export async function correctFacts(
  page: Page,
  corrections: Partial<Record<RawFactPath, string>>
): Promise<void> {
  await page.getByRole("button", { name: "Review facts" }).click();
  await expect(page.getByTestId("fact-review-panel")).toBeVisible();
  await Promise.all(
    Object.entries(corrections).map(async ([path, value]) => {
      const control = page.getByTestId(`fact-${path}`);
      const tagName = await control.evaluate((element) => element.tagName);
      if (tagName === "SELECT") {
        await control.selectOption(value);
      } else {
        await control.fill(value);
      }
    })
  );
  await page.getByRole("button", { name: "Save corrected facts" }).click();
  await expect(page.getByTestId("fact-review-panel")).toHaveCount(0);
  await expect(page.getByText(/facts revision 2/)).toBeVisible();
  await expect(page.getByTestId("analysis-result")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByTestId("analysis-result-heading")).toBeFocused();
}
