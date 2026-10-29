# Fable Crown

[Play the demo](https://cudldev.github.io/Fable-Crown/) · [Tile RPG plan](docs/TILE_RPG_PLAN.md) · [Progress](docs/PROGRESS.md)

A painterly autonomous RPG on a 256 × 192 isometric tile world with three settlements and 24 characters. Alden follows persistent ambitions; you guide his thoughts or give direct and queued orders. The Old School RuneScape reference informs tile movement, skills and preparation; the setting, quests and generated art are original.

Nine skills progress separately: Woodcutting, Mining, Smithing, Fishing, Cooking, Attack, Strength, Defence and Hitpoints. Gather trees, ores and fish with appropriate tools; smelt, smith and cook; trade real supplies for bronze/iron/steel equipment. A 28-slot backpack, separate equipment and connected personal bank support longer journeys. Villagers keep their own supplies.

Three quests earn access to frontier anvils, Briarford’s kitchen and a shorter river crossing. Moss boars, copper-shell mites and road outlaws provide melee training and loot. Food restores health; defeat preserves equipped gear and XP, leaving all backpack belongings in a recoverable grave without fees or permanent loss.

## Playing

The world fills the browser. Drag to pan, pinch/wheel or use +/− to zoom. World opens the overview; the town plaque opens destinations, quest givers and wilderness encounters. Follow Alden returns the camera. The tile grid is optional.

Tap a resource to choose a goal such as gathering ore or reaching a Mining level. Alden handles tools, prerequisites, travel, depleted nodes and full backpacks. Direct single actions and queued orders remain available. Circular rings show action cycles; reward floaters show items, XP and level-ups. The dock tracks the latest skill and XP remaining to its next level. Ores, logs and food occupy one backpack slot per item; coins, bait and feathers stack. Bank totals remain aggregated.

Walk/Run shows remaining energy. Running takes up to two legal tile steps and consumes energy; exhaustion switches to walking. Walking, waiting and stationary work restore energy. The chosen movement mode persists across reloads. A new ambition replaces the current action, and pending orders remain editable. Quest visits retain that quest as an ambition. Automatic banking stores spare tools when they obstruct crafting; completed quests show delivered supplies instead of an empty requirement count.

Alden’s planner uses fixed local rules. Skills and progress persist; there is no learned decision policy or connected local narrative LLM in this slice.

Tap ground to travel. Inspect a resource, service or enemy for Do now/Add next. Open Thoughts to choose an ambition and see its steps, reorder/remove up to eight pending orders, or let Alden continue. Wait stops the current action and holds pending orders; Let Alden decide resumes them before autonomous work. Periodic thoughts resolve automatically after about 20 seconds; routine play never waits for a reply. Quest ambitions handle training, tools, gathering, crafting, food and travel.

Skills shows levels, XP and next unlocks. Bag shows all 28 slots, food, equipment, combat style and bank withdrawals. Journal tracks quests and rewards. Shops show stock and prices; Aim for this asks Alden to earn and buy a tool.

Progress saves in IndexedDB. This iteration starts a fresh V3 chapter; earlier village saves remain untouched and exportable from the menu. Export/import transfers the RPG chapter. Offline progress runs at 25% speed for up to 24 hours per absence. The shell and 23 generated assets (7.4 MiB) cache for offline travel; Save world offline confirms the complete download.

## Development and hosting

Node 22.12+: `npm ci`, then `npm run dev`. Checks: `npm test`, `npm run typecheck`, `npm run build`, `npm run check:dist`, `npm run test:browser`. Chrome is used locally; CI installs Chromium. Playwright starts production preview. For Pages subpath verification set `GITHUB_REPOSITORY=cudldev/Fable-Crown` when building, and `DEMO_URL=http://127.0.0.1:4174/Fable-Crown/` for browser tests. Rebuild after changing the base; do not share a build directory across concurrent builds.

GitHub Settings → Pages → Source: **GitHub Actions**. Push to main runs the gates and deploys. `GITHUB_REPOSITORY` derives the subpath; `VITE_BASE_PATH` overrides it. PWA scope is relative. No server, secret, API key, telemetry, hosted inference or required third-party runtime call.

The deterministic TypeScript simulation is independent of rendering and uses 600 ms integer ticks. Canvas projects logical tiles into the painterly isometric view. [Original artwork and exact prompts](assets/generated/README.md) remain versioned. Characters use limited painted-cutout animation. Multiplayer, Grand Exchange, advanced combat, detailed social routines and optional browser-local narrative models remain outside this slice. Browser emulation is tested; no physical-device/FPS claim is made. Use one game tab per device.

React/React DOM are MIT licensed; dependency licenses accompany npm packages. Reference collages and older generated backdrops are retained as sources and never loaded by the tile game.
