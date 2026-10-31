# Fable Crown — Demo-first Scope and Visual Acceptance

> Current actor update (2026-10-30): the user approved the full pixel billboard cast in the voxel world. See [cast implementation](PIXEL_CAST.md) and [generation skill](../skills/fable-pixel-characters/SKILL.md). Earlier voxel-volume/rig requirements for characters and enemies below are superseded; environment migration and gameplay contracts remain.


> Latest approved iteration: [TILE_RPG_PLAN.md](TILE_RPG_PLAN.md) supersedes the earlier construction-only slice. Keep the zero-cost, full-browser and verified-Pages stop rules; use the current [voxel art direction](ART_DIRECTION.md).

> Latest approved expansion: see [EXPANDED_WORLD.md](EXPANDED_WORLD.md). The demo now uses a full-browser world, three settlements, 24 characters, generated layered artwork and direct contextual intentions/queue controls. This supersedes the earlier one-hamlet and limited-player-control scope below.

## Primary objective

Deliver ONE browser-playable, mobile-first **voxel fantasy prince-and-village vertical slice** deployed to GitHub Pages, using as little of the remaining Codex allowance as practical. Read `docs/GAME_DESIGN.md`, `docs/ART_DIRECTION.md` and `docs/RESET_AND_BUDGET_POLICY.md` before implementing.

## Smallest complete experience

- One readable frontier settlement: manor, storage/bank, forest, mine, construction plot, paths and work areas.
- One cooperative autonomous prince (Alden, placeholder name) and 12–20 villagers with basic roles and visible actions.
- Villagers autonomously gather timber/stone, move materials, store supplies and build **one blacksmith workshop** from a validated bill of materials. A simple material ledger, action timings, and a visible finished structure are required.
- Prince's Thought & Intention card offers 2–3 feasible strategies; timed automatic choice and nonblocking actions work. Player can inspect prince and villagers and observe why a plan was selected.
- 600ms ticks, skill/XP/inventory basics, save/resume, simple calendar and at least a credible bounded offline catch-up proof of concept.
- Portrait and landscape UX: tap to inspect, pan/zoom, bottom sheet/side panel. No virtual joystick or button-heavy UI.
- Static GitHub Pages PWA, zero paid APIs; local narrative model is optional and must not delay a playable demo.

## Voxel assets

- Terrain reference: `assets/reference/fable_crown_voxel_current.png` and selected A Warm storybook under `assets/explorations/voxel/terrain-style-v1/`; accepted oak VOX is the volumetric asset baseline.
- Earlier painterly, watercolor/ink and HD-2D references are historical. See [ART_DIRECTION.md](ART_DIRECTION.md).
- Create original reusable native VOX terrain, characters, trees, ore, buildings and props. Follow [VOXEL_PIPELINE.md](VOXEL_PIPELINE.md) and the staged [migration inventory](VOXEL_ASSET_MIGRATION.md). Concept images are not completed geometry or animated actors.
- Use shared cubic scale, flat block terraces and level building pads; broad warm matte color groups and soft material joins. Native VOX drives instanced cubes and derived LOD.
- Prince recognizable by blue cloak/gold trim; occupations distinguishable by outfit/tool. Preserve independent animated limbs, tool grips and cape attachments. Character design acceptance remains pending.
- The scene must be human-readable at mobile scale. Clearly distinguish work in progress from completed workshop.

## Acceptance and stop rule

1. Deployed browser build opens on phone and desktop in both orientations.
2. Prince and villagers act without player input, gather resources, deliver them, and construct the workshop; inventories/resources obey conservation rules.
3. Player selects an intention OR ignores it; both routes lead to valid autonomous behavior.
4. Save/reload preserves construction and character state; calendar/offline handling is safe and idempotent.
5. Voxel presentation matches the selected warm terrain and accepted oak style, with recognizable characters, professions and work states. Review actual geometry and animation at gameplay/phone scale; record remaining fallback assets explicitly.
6. Tests, typecheck, build and deployment validation pass. Report actual usage and STOP once a credible demo is playable, preferably leaving budget unused.
