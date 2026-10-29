# Fable Crown — Demo-first Scope and Visual Acceptance

> Latest approved expansion: see [EXPANDED_WORLD.md](EXPANDED_WORLD.md). The demo now uses a full-browser world, three settlements, 24 characters, generated layered artwork and direct contextual intentions/queue controls. This supersedes the earlier one-hamlet and limited-player-control scope below.

## Primary objective

Deliver ONE browser-playable, mobile-first **painterly fantasy prince-and-village vertical slice** deployed to GitHub Pages, using as little of the remaining Codex allowance as practical. Read `docs/GAME_DESIGN.md`, `docs/ART_DIRECTION.md` and `docs/RESET_AND_BUDGET_POLICY.md` before implementing.

## Smallest complete experience

- One readable frontier settlement: manor, storage/bank, forest, mine, construction plot, paths and work areas.
- One cooperative autonomous prince (Alden, placeholder name) and 12–20 villagers with basic roles and visible actions.
- Villagers autonomously gather timber/stone, move materials, store supplies and build **one blacksmith workshop** from a validated bill of materials. A simple material ledger, action timings, and a visible finished structure are required.
- Prince's Thought & Intention card offers 2–3 feasible strategies; timed automatic choice and nonblocking actions work. Player can inspect prince and villagers and observe why a plan was selected.
- 600ms ticks, skill/XP/inventory basics, save/resume, simple calendar and at least a credible bounded offline catch-up proof of concept.
- Portrait and landscape UX: tap to inspect, pan/zoom, bottom sheet/side panel. No virtual joystick or button-heavy UI.
- Static GitHub Pages PWA, zero paid APIs; local narrative model is optional and must not delay a playable demo.

## Painterly assets

- PRIMARY reference: `assets/reference/fable_crown_painterly_latest.png`.
- SECONDARY: `assets/reference/fable_crown_watercolor_ink.png`.
- Earlier `hd2d_demo_concept.png` is superseded for style.
- Create original clean reusable painterly backgrounds, character cutouts, trees, stone, buildings and UI motifs. Concept collages are not game-ready sprite atlases. Use efficient layers/planes and selective 2.5D depth rather than expensive 3D materials.
- Prince recognizable by blue cloak/gold trim; occupations distinguishable by outfit/tool. More detailed portraits than small in-world actors.
- The scene must be human-readable at mobile scale. Clearly distinguish work in progress from completed workshop.

## Acceptance and stop rule

1. Deployed browser build opens on phone and desktop in both orientations.
2. Prince and villagers act without player input, gather resources, deliver them, and construct the workshop; inventories/resources obey conservation rules.
3. Player selects an intention OR ignores it; both routes lead to valid autonomous behavior.
4. Save/reload preserves construction and character state; calendar/offline handling is safe and idempotent.
5. Painterly presentation is recognizable; no pixelation or anonymous debug cubes in final demo.
6. Tests, typecheck, build and deployment validation pass. Report actual usage and STOP once a credible demo is playable, preferably leaving budget unused.
