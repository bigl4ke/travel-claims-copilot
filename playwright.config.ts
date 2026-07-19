import { defineConfig, devices } from "@playwright/test";

const playwrightJsonOutput =
  process.env.PLAYWRIGHT_JSON_OUTPUT ?? "test-results/playwright-results.json";

export default defineConfig({
  testDir: "./tests/e2e",
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["json", { outputFile: playwrightJsonOutput }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev:offline",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false
  }
});
