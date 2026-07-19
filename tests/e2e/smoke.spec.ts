import { expect, test } from "./offline-test";

test("renders the existing application", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toBeVisible();
});
