import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
export default defineConfig({
  plugins: [react()],
  base:
    process.env.VITE_BASE_PATH ||
    (repo && repo !== `${owner}.github.io` ? `/${repo}/` : "/"),
  // CI has fewer cores: heavy replay/planning suites must not compete for their timeout budget.
  test: { include: ["tests/**/*.test.ts"], maxWorkers: process.env.CI ? 1 : 4 },
} as Parameters<typeof defineConfig>[0]);
