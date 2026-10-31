import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/rpg-*.spec.ts",
  workers: 1,
  timeout: process.env.CI ? 300000 : 150000,
  expect: { timeout: process.env.CI ? 60000 : 5000 },
  use: {
    actionTimeout: process.env.CI ? 60000 : 20000,
    baseURL: process.env.DEMO_URL || "http://127.0.0.1:4174/",
    channel: process.env.CI ? undefined : "chrome",
    headless: true,
    // Keep all functional assertions on CPU-only CI; explicit high-DPI cases override this.
    deviceScaleFactor: process.env.CI ? 0.5 : 1,
    launchOptions: process.env.CI ? { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } : undefined,
  },
  webServer: process.env.DEMO_URL?.startsWith("https:")
    ? undefined
    : {
        command: `npm run preview -- --port ${new URL(process.env.DEMO_URL || "http://127.0.0.1:4174/").port || "4174"}`,
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
