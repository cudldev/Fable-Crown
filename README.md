# Fable Crown

> Current actor update (2026-10-30): the user approved the full pixel billboard cast in the voxel world. See [cast implementation](docs/PIXEL_CAST.md) and [generation skill](skills/fable-pixel-characters/SKILL.md). Earlier voxel-volume/rig requirements for characters and enemies below are superseded; environment migration and gameplay contracts remain.


[Play the demo](https://cudldev.github.io/Fable-Crown/) · [Tile RPG plan](docs/TILE_RPG_PLAN.md) · [Progress](docs/PROGRESS.md)

An autonomous RPG targeting warm storybook voxel fantasy on a 256 × 192 tile world with three settlements and 24 characters. Alden follows persistent ambitions; you guide his thoughts or give direct and queued orders. The Old School RuneScape reference informs tile movement, skills and preparation; the setting, quests and generated art are original.

Ten skills progress separately: Woodcutting, Mining, Smithing, Fishing, Cooking, Attack, Strength, Defence, Hitpoints and Ranged. Gather trees, ores and fish with appropriate tools; smelt, smith and cook; trade real supplies for tools, armour, bows and ammunition. A 28-slot backpack, separate equipment and connected personal bank support longer journeys. Villagers keep their own supplies.

Six original quests introduce the forge, kitchen, river crossing, archery, courier routes and eastern watch. Wildlife and outlaws provide melee/ranged training and loot. Food restores health; defeat preserves equipped gear and XP, leaving backpack belongings in a recoverable grave without fees or permanent loss.

## Playing

The world fills the browser. Drag to pan, pinch/wheel or use +/− to zoom. World opens the overview; the town plaque opens destinations, quest givers and wilderness encounters. Follow Alden returns the camera. The tile grid is optional.

Oakrest’s paths connect the manor, workshop, woods, quarry, farm and riverbank. Read signs for directions and approach gates to open or close them. Starting thoughts offer the forge, hunting preparation or earning a better pickaxe; Alden begins the forge journey automatically.

Tap a resource to choose a goal such as gathering ore or reaching a Mining level. Alden handles tools, prerequisites, travel, depleted nodes and full backpacks. Direct single actions and queued orders remain available. Circular rings show action cycles; reward floaters show items, XP and level-ups. The dock tracks the latest skill and XP remaining to its next level. Ores, logs and food occupy one backpack slot per item; coins, bait and feathers stack. Bank totals remain aggregated.

Messages expands a persistent history of conversations, quest progress, discoveries, level-ups and important problems. All/Events/Dialogue filters keep it readable. Routine item and XP gains stay in the world. Visible action phases, contact sounds, arrows and hit reactions follow committed simulation results.

Walk/Run shows remaining energy. Running takes up to two legal tile steps and consumes energy; exhaustion switches to walking. Walking, waiting and stationary work restore energy. The chosen movement mode persists across reloads. A new ambition replaces the current action, and pending orders remain editable. Quest visits retain that quest as an ambition. Automatic banking stores spare tools when they obstruct crafting; completed quests show delivered supplies instead of an empty requirement count.

Alden compares available stories, upgrades, skill milestones and discoveries using local rules. Open **Thoughts → Personality & priorities** to edit Curiosity, Craftsmanship, Helpfulness, Adventurousness and Caution or choose a preset. Preview shows which goals rise or fall; **Why this ambition?** preserves the actual comparison behind his last choice. Applying traits keeps the current ambition and queued orders; **Let Alden choose a new ambition** explicitly requests another choice. Caution also affects autonomous healing and retreat. Skills and XP remain earned, with no learned policy or connected narrative LLM.

The world card shows **Now / Why / Next**, action progress, destination focus and Alden-only Pause/Resume. Thoughts expands the explanation and the last eight meaningful plan changes. These are grounded in actual actions, supplies and prerequisites.

Tap ground to travel. Inspect a resource, service or enemy for Do now/Add next. Open Thoughts to choose an ambition and see its steps, reorder/remove up to eight pending orders, or let Alden continue. Wait stops the current action and holds pending orders; Let Alden decide resumes them before autonomous work. Periodic thoughts resolve automatically after about 20 seconds; routine play never waits for a reply. Quest ambitions handle training, tools, gathering, crafting, food and travel.

Skills shows levels, XP and next unlocks. Bag shows all 28 slots, food, equipment, combat style and bank withdrawals. Journal tracks quests and rewards. Shops show stock and prices; Aim for this asks Alden to earn and buy a tool.

Progress saves in IndexedDB. V5 copies existing V4/V3 progress while retaining earlier records as exportable archives. Export/import transfers the RPG chapter. Offline progress runs at 25% speed for up to 24 hours per absence. Save world offline confirms the complete artwork download and shows its size.

## Development and hosting

The voxel world with the approved pixel billboard cast is the only gameplay renderer. It opens at the ordinary game URL; old renderer/character query parameters cannot restore retired styles. Native VOX trees and flat ground are integrated; remaining buildings/props still use environment placeholders. Open `?assetReview=1` for the read-only art workbench. Painterly and ink/fitted character experiments are excluded from the release; source artwork stays archived.

Node 22.15+: `npm ci`, then `npm run dev`. Checks: `npm test`, `npm run typecheck`, `npm run build`, `npm run check:dist`, `npm run test:browser`. Chrome is used locally; CI installs Chromium. Playwright starts production preview. For Pages subpath verification set `GITHUB_REPOSITORY=cudldev/Fable-Crown` when building, and `DEMO_URL=http://127.0.0.1:4174/Fable-Crown/` for browser tests. Rebuild after changing the base; do not share a build directory across concurrent builds.

GitHub Settings → Pages → Source: **GitHub Actions**. Push to main runs the gates and deploys. `GITHUB_REPOSITORY` derives the subpath; `VITE_BASE_PATH` overrides it. PWA scope is relative. No server, secret, API key, telemetry, hosted inference or required third-party runtime call.

The deterministic TypeScript simulation is independent of rendering and uses 600 ms integer ticks. Three.js presents the voxel world independently of the simulation. [Original artwork and exact prompts](assets/generated/README.md) remain versioned. Characters use the approved pixel billboards and separate held tools. Multiplayer, Grand Exchange, advanced combat, detailed social routines and optional browser-local narrative models remain outside this slice. Browser emulation is tested; no physical-device/FPS claim is made. Use one game tab per device.

React/React DOM and Three.js are MIT licensed; dependency licenses accompany npm packages. Reference collages and older generated backdrops are retained as sources and never loaded by the tile game.
