import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

// Local art, GPU, screenshot and performance review. Never a deployment gate.
export default defineConfig({
  ...config,
  testMatch: [
    "**/rpg-acceptance.spec.ts", "**/rpg-inputs.spec.ts", "**/rpg-gameplay-feel.spec.ts",
    "**/rpg-celestial.spec.ts", "**/rpg-click-feedback.spec.ts",
    "**/rpg-daylight-shadows.spec.ts", "**/rpg-fidelity.spec.ts",
    "**/rpg-fog-*.spec.ts", "**/rpg-foliage.spec.ts",
    "**/rpg-lens*.spec.ts", "**/rpg-panel-performance.spec.ts",
    "**/rpg-pixel-cast.spec.ts", "**/rpg-render-style.spec.ts",
    "**/rpg-shore-outline.spec.ts", "**/rpg-sky.spec.ts",
    "**/rpg-sprite-lighting.spec.ts", "**/rpg-view-distance.spec.ts",
    "**/rpg-three.spec.ts", "**/rpg-visual-settings.spec.ts", "**/rpg-voxel*.spec.ts",
    "**/rpg-water*.spec.ts",
  ],
});
