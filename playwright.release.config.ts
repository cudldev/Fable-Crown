import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

// CPU-only CI checks worker/storage/PWA contracts without software-GPU stalls.
// The actual WebGL world and all visual interactions are reviewed locally.
export default defineConfig({
  ...config,
  testMatch: "**/release-smoke.spec.ts",
  timeout: 60000,
  expect: { timeout: 15000 },
  use: { ...config.use, actionTimeout: 15000, deviceScaleFactor: 1, launchOptions: undefined },
});
