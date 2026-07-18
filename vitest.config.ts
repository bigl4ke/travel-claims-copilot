import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup/offline.ts"],
    restoreMocks: true,
    exclude: [...configDefaults.exclude, "tests/e2e/**", ".next/**"]
  }
});
