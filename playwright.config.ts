import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 150000,
  use: {
    baseURL: process.env.DEMO_URL || "http://127.0.0.1:4174/",
    channel: process.env.CI ? undefined : "chrome",
    headless: true,
  },
  webServer: process.env.DEMO_URL?.startsWith("https:")
    ? undefined
    : {
        command: "npm run preview -- --port 4174",
        env: {
          VITE_BASE_PATH: new URL(
            process.env.DEMO_URL || "http://127.0.0.1:4174/",
          ).pathname,
        },
        url: process.env.DEMO_URL || "http://127.0.0.1:4174/",
        reuseExistingServer: true,
      },
  reporter: "list",
});
