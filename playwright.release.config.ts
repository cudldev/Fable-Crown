import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

// Keep publication focused on durable gameplay and PWA contracts.
// Visual quality and performance comparisons belong to the local visual config.
export default defineConfig({
  ...config,
  projects: [
    { name: "core", testMatch: "**/rpg-acceptance.spec.ts" },
    { name: "controls", testMatch: "**/rpg-inputs.spec.ts", grep: /left click mines|touch hold/ },
    { name: "shell", testMatch: "**/rpg-three.spec.ts", grep: /world shell and save controls|voxel is the default|3D camera and touch|default voxel world reloads offline|unavailable WebGL/ },
  ],
});
