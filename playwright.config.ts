import { defineConfig, devices } from "@playwright/test";

const playwrightJsonOutput =
  process.env.PLAYWRIGHT_JSON_OUTPUT ?? "test-results/playwright-results.json";
const playwrightPort = process.env.PLAYWRIGHT_PORT ?? "3000";
const playwrightBaseUrl = `http://127.0.0.1:${playwrightPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["smoke.spec.ts", "main-ui.spec.ts"],
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["json", { outputFile: playwrightJsonOutput }]],
  use: {
    baseURL: playwrightBaseUrl,
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev:offline",
    url: playwrightBaseUrl,
    env: { PORT: playwrightPort },
    reuseExistingServer: false
  }
});
