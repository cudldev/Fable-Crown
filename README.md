# Fable Crown

[Play the demo](https://cudldev.github.io/Fable-Crown/) · [Design](docs/GAME_DESIGN.md) · [Expanded-world release](docs/EXPANDED_WORLD.md)

A painterly autonomous RPG frontier: 6,600 × 4,440 world units, nine regions, three settlements and 24 characters. Alden and the villagers gather, carry supplies, build a blacksmith workshop and forge tools. Local stores have separate inventories; cross-town supplies travel on foot.

The world fills the browser. Drag to explore, pinch/wheel or use +/− to zoom, and use World for the overview or the Oakrest plaque for destinations. Follow Alden brings the camera back. Tap ground to travel; tap places for gathering, deposits, withdrawals, construction or forging. Choose Do now or Add next, then edit/reorder/cancel up to eight queued intentions. Wait here pauses Alden; Let Alden decide resumes his queue and autonomy. An empty queue leaves a short thinking window before he finds useful work. Villagers keep gathering and resting independently in their home settlements.

Progress saves in IndexedDB. Export/import a chronicle to transfer it. Original saves migrate to the larger world. Away work advances at 25% speed for at most 24 hours per absence; the calendar follows the device date. Visited artwork is cached automatically. The menu offers the full world artwork download (about 9.1 MiB) for offline exploration.

## Development

Node 22.12+; run `npm ci`, then `npm run dev`. Checks: `npm run typecheck`, `npm test`, `npm run build`, `npm run check:dist`, `npm run test:browser`. Browser tests use installed Chrome locally; CI installs Chromium. Playwright starts the production preview when needed. For repository-subpath checks, set `GITHUB_REPOSITORY=cudldev/Fable-Crown` for both build and preview, and `DEMO_URL=http://127.0.0.1:4174/Fable-Crown/` for browser tests. Restart an existing root preview when changing base.

## Hosting

Public GitHub repository; Settings → Pages → Source: **GitHub Actions**. Push to main to test, build and deploy. GITHUB_REPOSITORY derives the project subpath; VITE_BASE_PATH overrides it (use / for a custom domain). The manifest and service worker use relative scope. No secrets, server, paid API, telemetry, external fonts or runtime asset CDN.

## Demo boundaries

Original generated watercolor/ink landscapes and independent character/building cutouts replace the old SVG scenery. [Artwork, sources and prompts](assets/generated/README.md). Characters use limited painted-cutout animation. Detailed needs, conversations, combat, quests, a broader economy and optional browser-local LLM remain deferred. Responsive browser emulation is covered; no physical-device or FPS benchmark is claimed. Use one open game tab per device; saves are local.

React and React DOM are MIT licensed; development dependency licenses accompany npm packages. Concept collages remain references and are not loaded by the game.
