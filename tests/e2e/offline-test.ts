import { expect, test as base } from "@playwright/test";

export { expect };
export type { Locator, Page } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, run) => {
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
        await route.continue();
        return;
      }
      await route.abort("blockedbyclient");
      throw new Error(`Offline E2E blocked non-loopback request to ${url.origin}`);
    });
    await run(page);
  }
});
