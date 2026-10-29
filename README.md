# Fable Crown

[Play the demo](https://cudldev.github.io/Fable-Crown/) · [Design](docs/GAME_DESIGN.md)

A painterly fantasy village with a young prince and fifteen villagers. Watch woodcutters and miners gather and bank supplies, builders carry them to the workshop, and a blacksmith forge the first tools. Guide Alden through three timed intentions, or let him decide. The first workshop takes roughly two minutes; no input is required.

Drag/pinch the map, tap people or landmarks to inspect, and follow the material ledger. Progress saves in this browser’s IndexedDB. Export/import a chronicle to transfer it. While away, work advances at 25% speed for at most 24 hours per absence; the calendar follows the device date.

## Development

Node 22.12+; `npm ci`, `npm run dev`. Checks: `npm run typecheck`, `npm test`, `npm run build`, `npm run check:dist`, `npm run test:browser`. Browser tests use installed Chrome locally; CI installs Chromium. `npm run preview -- --port 4174` serves the production build. The Playwright configuration starts this server if necessary.

## Hosting

Public GitHub repository; Settings → Pages → Source: **GitHub Actions**. Push to `main` to test, build and deploy. `GITHUB_REPOSITORY` derives the project subpath; `VITE_BASE_PATH=/custom/` overrides it (use `/` for a custom domain). The manifest and service worker use relative scope and cache only the built app. No secrets, server, account, paid API, telemetry, external fonts or runtime asset CDN.

## Demo boundaries

Original hand-authored SVG watercolor/ink placeholders, not final painted production assets. No pixel rendering. Sixteen actors and one construction goal; advanced town systems, combat, large-scale benchmarks and optional browser-local LLM remain deferred. Procedural narrative works fully offline. Responsive browser emulation is covered; physical Android/iOS and installation checks still need devices. Saves are device-local; use one open game tab per device.

React and React DOM are MIT licensed; development dependency licenses accompany npm packages. Scene, character and interface illustrations are original source assets. Concept collages remain reference material and are not loaded by the game.
