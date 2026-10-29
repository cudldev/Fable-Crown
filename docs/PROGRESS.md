# Progress — 2026-10-29

## Vertical slice

Implemented the current demo-first override, rather than the superseded M0–M8 roadmap. Foundation, deterministic simulation, autonomous gathering/hauling/building, Thought & Intention, painterly presentation and bounded offline proof of concept are integrated.

- Alden + 15 villagers; 24 timber + 16 stone delivered, then 48 labor constructs the workshop. Sora unlocks smithing, hauls iron and forges tools.
- Three strategies; 34-tick automatic local choice (20.4s). XP, carried inventory, finite storage routines, construction bill and conserved resources.
- Worker-owned 600ms simulation, IndexedDB saves, validated JSON import/export and local calendar. Away work at25% for max24h/36,000 ticks, retaining fractional time; repeat reconciliation is idempotent.
- Original SVG watercolor/ink placeholders, selection, pan/pinch/zoom, portrait/landscape. Concept collages are not runtime assets.
- Static PWA, cached shell/assets, repository base and relative scope. Actions includes typecheck, tests, build, path validation and browser checks.

## Verification

Strict typecheck, 19 simulation tests, build and built-path/PWA validation pass locally. Browser checks pass: selected trade leads to completed workshop; inspection, save/reload, portrait390×844 and landscape844×390 without horizontal overflow. Ignored thought chooses local; 72h catch-up caps at36,000 ticks; invalid import preserves game; cached reload works with network disabled. Fixed map pointer capture and Vary-header cache mismatch found in browser QA. Tightened screenshot timing to await the lazy scene after reload.

`npm audit`: zero advisories after updating the test runner. No required third-party runtime requests observed. No API keys, paid services, model downloads or reset redemption.

Initial Actions passed install/checks/build, then failed because Pages was not yet enabled. Pages source was configured to Actions. Final code commit `ad28a2a` passed every CI gate and deployed successfully: https://github.com/cudldev/Fable-Crown/actions/runs/40792122171 .

Live verified at https://cudldev.github.io/Fable-Crown/ : world and all16 actors load, autonomous gathering runs, intention selection and tapping Alden’s inspector work. Browser console has no errors. Root and repository-subpath builds are verified. Local suite:19 simulation tests +2 browser scenarios pass; CI repeats them before deployment. Screenshots are in `docs/screenshots/`.

## Limits and deferred scope

Illustrated placeholders are simpler than production paintings. No physical phone/GPU/FPS benchmark claimed. Offline proof of concept uses bounded deterministic tick replay, not the future analytical resolver. Calendar records local date; daily events/seasons deferred. Use one game tab; no cloud sync. Local LLM, combat, scaling, expanded towns and production art deferred by stop rule.

## Ownership and budget

Lead: contracts, infrastructure, UI, saves, integration, QA/deployment. Simulation specialist: simulation/tests. Art specialist: one bounded scene refinement. No model changes.

Usage read at start:13% weekly remaining; latest:12% remaining. No scheduled/banked reset used. Inside110% planning ceiling. Verified playable Pages slice delivered; stopped. Remaining roadmap intentionally deferred.

## Expanded-world release — 2026-10-29

Implemented the approved follow-up in EXPANDED_WORLD.md: 6600×4440 world (36× original area), nine regions, three populated settlements, 24 characters and 18 destinations. Homes, storehouses and cliffs share navigation footprints; two bridges provide legal river crossings. Regional stores remain independent and supplies travel with their carriers.

The world now fills the browser with close following, pan/pinch/wheel zoom, a world overview and contextual overlays. Players can move, gather 2/10/20 or repeat, deposit/withdraw, build and forge; Do now/Add next, cancel/reorder up to eight queued intentions, Wait here and Let Alden decide are integrated. Empty-queue thinking lasts six ticks; original thought selection remains 34 ticks. Villagers maintain their own local resource buffers and rest once supplied.

Original generated artwork: nine terrain regions, world map, five role cutouts, four buildings and four props. PNG originals and normalized prompt set: assets/generated/; 23 WebPs in public/art/ total 11.9 MiB. Built-in ImageGen used; no paid inference API. Regions load lazily and cache on visit; menu displays the measured full-download size and supports explicit whole-world offline storage.

V2 saves retain queues and migrate V1 XP, resources, time, coins and construction; only legacy actors inside new footprints are moved to nearby safe ground. Interrupted player intentions retain their remaining quantities. Resource conservation, 25% capped catch-up, idempotence, strict imports and zero third-party runtime requirements remain enforced.

Verification: strict TypeScript build, 40 simulation/navigation tests and four browser scenarios pass. Root and /Fable-Crown/ builds checked; all 23 artwork files, measured download bytes, relative manifest scope and shell URLs validated. Browser scenarios cover gathering/queue/wait controls, physical cross-town travel through offline reconciliation, invalid-import protection, all-nine-region download and offline exploration, drag versus ground tap, carried-material deposit, desktop and both phone orientations, 44px HUD targets and no horizontal overflow. Runtime artwork decodes and no external requests/page errors are checked. Screenshots: docs/screenshots/world-*.png. Route caching returns independent waypoints so actors cannot mutate each other’s paths; a repeated-route test timeout found during integration was corrected.

Model routing used supported per-agent parameters: Sol High for simulation/navigation, Sol Medium for rendering, Luna Medium for bounded browser QA; lead integrated UI/art/worker/PWA, reviewed and verified. One specialist at a time. Current usage check: 90% used / about 10% remaining; no scheduled or banked reset used and no purchased credits. Within the 110% ceiling.

Live deployment verification is pending this release push. Detailed daily needs/social interactions, combat/quests/economy expansion, optional local narrative LLM, physical-device and FPS benchmarks remain outside this approved slice. No performance claim is made.

Art acceptance correction: user rejected the first generated set. ART_AUDIT.md records inspection of all 23 assets against the primary reference. Release 43fbb82 was pushed before the feedback arrived; cancellation of its in-progress Actions run was requested. Visual acceptance remains incomplete; do not mark the expanded release complete.

Confirmed release hold: workflow 40816403401 is cancelled, with Pages configuration/upload/deploy skipped. A corrected reference-guided gameplay art sample is saved in docs/art-audit/ with its exact built-in ImageGen prompt. It is a direction proof only; replacement runtime assets and visual acceptance are still incomplete.

### Corrected art release

User approved the replacement gameplay proof with a request for slightly simpler treatment. Rebuilt all 23 assets against that visual reference, retaining original v1 PNGs for audit and preserving v2 PNGs plus exact prompts. Current artwork: 9.1 MiB. Added soft overlapping terrain joins, irregular water/road washes, measured cutout base anchors, calmer labels and collision-aware woodland scenery. Gatherers use separate reachable work spots. A hauling transaction could leave remaining=0 at a save boundary; fixed and covered by restoring every tick across 150 ticks.

Final local checks: strict production typecheck/build; 42 unit cases; four complete browser scenarios plus the added full thought-to-workshop/forge scenario pass. Full five-scenario suite will repeat in CI. Current usage: 91% used, about 9% remaining; no reset redemption, purchases or runtime inference API. Corrected live deployment pending push/verification.

### Live release verified

Corrected code c0b57d1 passed all CI gates and deployed: https://github.com/cudldev/Fable-Crown/actions/runs/40818940478 . Actual public URL https://cudldev.github.io/Fable-Crown/ was then tested directly: all five browser scenarios passed, including queue/ground controls, physical travel, whole-world offline exploration, invalid import protection, desktop/mobile layouts, thought choice, completed workshop and smithing. Public manifest exactly matches local version de3bc89177bb: 23 artwork files, 9,566,736 bytes. All 42 simulation/navigation cases and strict build/path/PWA validation passed. Public-run screenshots are saved in docs/screenshots/world-*.png.

The approved style correction is integrated; this verified expanded playable slice is complete. Stop here. Detailed social/daily-needs systems, combat, economy expansion, optional local LLM and physical-device performance benchmarks remain deferred as planned. Latest usage check: about 9% weekly allowance remaining; no reset or credit redemption.

## Tile RPG — Stage1 gate

Approved tile-RPG plan recorded in TILE_RPG_PLAN.md. Work isolated on codex/tile-rpg; main/Pages remain unchanged. Sol High world specialist owns pure world/navigation/tests; lead owns contracts, movement clock, new save namespace, worker, Canvas renderer and shell. The earlier autonomy prototype was checkpointed in44146e0 before refactoring.

Implemented renderer-independent256×192 tile world in32×32 chunks, directional collision,8-neighbor A*, two legal run steps,24 spawns,75 resource nodes and reachable town services. Added fresh V3 storage while leaving the old v1-key archive untouched/exportable. New branch preview uses ?chapter=3. Canvas isometric renderer projects/backsamples tiles, draws cached chunks and separate cutouts, supports pan/pinch/wheel/overview/optional grid. Four original low-contrast tile materials generated against the approved style proof; exact prompts and source PNGs in assets/generated/v3/.

Gate:65 unit tests pass (51 old/prototype,8 world/navigation,6 foundation); strict TypeScript and repository-subpath production build pass. Browser gate verifies V2 archive/V3 separation, grid toggle, selectable world, desktop/portrait and no page errors. Sample chunk screenshots reviewed in docs/screenshots/rpg-stage1-*.png. Stage1 is runnable; skills/logistics/combat/planner remain next stages, not claimed complete.

## Tile RPG — Stage2 gate

Sol High gameplay specialist implemented local item/resource/recipe/vendor tables, atomic28-slot inventories, tool/equipment requirements, seeded gathering/depletion/respawn, smelting/smithing/cooking, connected player bank and private NPC stores. Persistent ambitions earn coins through real gathering/selling and buy iron/steel tools; no free item/coin grants. NPC production stops at useful64-item buffers. Lead added readable skill unlocks, backpack/equipment, merchant stock/prices, recipe panels and controls.

Gate:84 unit tests pass (19 new gameplay cases), strict typecheck and production build pass. Three browser scenarios pass: archived V2/newV3 separation + isometric view, exact bronze input consumption/XP through UI, and a steel-pickaxe ambition spending500 real coins and reducing vendor stock. Source requires no rendering/browser imports in core. Specialist measured a cold36,000-tick/24-actor engine run at558ms on this host, resulting save valid; no mobile/FPS claim. Stage3 combat/quests/graves remain unimplemented and unpublished.

## Tile RPG — Stage3 gate

Sol High core specialist added nine enemy spawns, seeded melee/style and Hitpoints XP, three-tick food delay, sustained engagement, bounded chase, persistent loot and lossless backpack graves. Three original quests consume real supplies and award skills/service access; the road opens a cached immutable world variant with a shorter central river crossing. Ambitions prepare supplies/tools/food/gear and complete prerequisites. Wait holds pending orders; direct orders remain authoritative. Lead integrated combat/quest/queue/bank controls; Sol Medium renderer added selectable enemies, loot, graves and map changes; Luna Medium QA added six browser scenarios.

Gate:104 unit cases, strict typecheck, production build, subpath/PWA asset checks and all nine RPG browser cases pass. All three quests complete without input or defeat in three tested seeds (ticks8244,8565,8216). Cold36,000-tick/24-actor core run measured758ms on this host; this is not an FPS/mobile benchmark. Tests cover food/engagement, partial loot, merged graves larger than28slots, accepted-quest kills, once-only rewards, bridge travel/save validity, serialization, invalid import, offline reload and phone orientations. Fixed a demonstrated full-backpack grave retry loop by banking recovered items before returning.

Six original transparent game assets generated with built-in ImageGen against the approved style proof: fisher, three enemies, anvil and cooking range. Sources/exact prompts in assets/generated/v3/. Frame helper now merges all versioned alpha anchors. Stage3 is committed on the integration branch; public release stays unchanged. Stage4 default-chapter switch, runtime asset cleanup and public verification remain. Latest usage:93% used/about7% remaining; no reset or purchase.

## Tile RPG — Stage4 local release gate

The tile RPG is now the default page. Earlier source/tests and archived save key remain; unused region/overview backdrops are removed from runtime, keeping23 generated WebPs /7,764,184bytes (manifest6652936b3125). Core and artwork preload for offline play; query-string navigation falls back to the cached shell. New workers activate after their complete cache is installed. Build manifest generation skips unchanged content, avoiding a Windows file-handle failure found during repeated path checks.

Local gates:104unit cases, strict builds and asset/PWA validation at both root and /Fable-Crown/, all10current browser scenarios pass. After worker activation changes, the offline installation/reload/decode scenario passed again. Reviewed screenshots rpg-desktop/portrait/landscape show the full-browser view and separate illustrated props/actors. Source has no required remote API, model, telemetry or external assets; offline images all decode. Fresh V3/old archive, real recipes/tool purchases, melee XP/food, quest supplies, recovery, held/reordered intentions, responsive44px HUD, invalid-import protection and zero third-party requests are covered. Detailed social routines, advanced combat and optional local narrative models remain deferred. Public deployment verification pending. Usage94%used/about6%remaining; no reset or charges.
