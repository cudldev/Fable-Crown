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

### Tile RPG live release verified

Release44840dd passed all CI gates and deployed: https://github.com/cudldev/Fable-Crown/actions/runs/40848399278 . Actual public https://cudldev.github.io/Fable-Crown/ then passed all10browser scenarios (38.1s), including combat/food/loot, grave recovery, quest ambitions/delivery, held/reordered intentions, real bronze consumption and steel-tool purchase, archive separation, invalid import, offline reload/art decoding and phone layouts. Public manifest matches6652936b3125,23files,7,764,184bytes. Public-run screenshots replace rpg-desktop/portrait/landscape.png.

The approved tile RPG slice is verified and playable. Stop here. Latest actual usage:94%used/about6%remaining; no scheduled/banked reset redeemed, purchased credits or paid runtime APIs. Coordination used Sol High world/gameplay specialists, Sol Medium renderer and Luna Medium browser QA, with lead-owned integration and stage gates. Future content/social routines/local narrative models are separate work.

## Interaction and performance follow-up — local gate

New user requests authorize this follow-up. Sol Medium renderer measured/fixed zoomed-out terrain cache thrashing and removed React animation-frame updates; Sol High gameplay added contextual persistent resource goals, actual bounded reward events, quest workspace/command repairs and Run/Walk energy; Luna Medium contributed browser coverage. Lead integrated circular action rings, item/XP/level floaters, current-skill XP progress, contextual goal controls, explicit one-item ore slots and completed-quest delivery text. Existing V3 saves remain valid; imported/offline reward history never replays as new gains.

Measured desktop Chrome benchmark: far-view median/p95 frame intervals1893.4/1951.9ms before,8.3/8.4ms after; sampled terrain rebuilds144→0. Lead integration repeat agrees; conditions/caveats and repeatable script in RENDER_BENCHMARK.md. This is not a mobile/FPS guarantee.

Investigated the user's actual public game tab: all three quests completed, current ambition Mining30. Fixed misleading0/6 material counts on completed quests. Separate regression reproduced a real infinite forge cycle when spare tool upgrades left insufficient two-input crafting space. Automatic banking stores surplus equipment without loss; seven partial quest states now complete with save/reload and item-conservation checks. New goals interrupt current actions; direct quest visits retain the quest intention. Run drains energy per actual step, exhaustion switches to Walk, walking/Wait/work recover energy and the toggle persists.

Gate:128unit tests, strict build/subpath/PWA checks and all15browser scenarios pass, including circular cycle feedback, XP/level-up, individual ore slots, historical reward suppression, Walk/Run recovery/consumption and one-visit quest follow-through. Reviewed feedback/cycle/mobile screenshots. After the final small HUD font correction, all five targeted feedback/movement browser cases pass again. Public deployment verification pending. Actual usage95%used/about5%remaining; no reset, paid API or charge. Local LLM and learned-policy systems remain unimplemented; user questions were answered candidly.

### Follow-up live verification

Release4fb81c8 passed CI and deployed: https://github.com/cudldev/Fable-Crown/actions/runs/40876120205 . All15browser scenarios then passed directly at https://cudldev.github.io/Fable-Crown/ (56.4s), including circular action progress, XP/items/level feedback, contextual goals, quest continuation/completed-delivery text, ore slots, persistent movement mode, energy consumption/recovery, offline reload and mobile layouts. Public-run screenshots are saved in docs/screenshots/. Existing saves need no reset. Verified playable; stop here. Final actual usage96%used/about4%remaining; no reset or paid API used.

## Early-game journey — G1 gate

User approved EARLY_GAME_JOURNEY.md. Isolated codex/early-game-journey; main remains stable. Sol Medium art supplied44 original directional idle/walk/work/combat frames in two atlases; lead approved both samples against existing Town Life proof. Source PNGs/exact prompts/provenance in assets/generated/v4/. Sol Medium renderer integrated per-cell extraction, stable body scale, bounded48-frame cache, health-loss splats, local80×60 minimap/expanded map and route previews. Lead added contextual Examine/Talk/item Use and original WebAudio action/footstep/ambient sounds with persisted mute/volume and fallback. Luna Medium supplied bounded browser tests.

G1:134unit cases and strict build/subpath/PWA pass; all18browser scenarios pass across final corrected runs. Audio unsupported/mute/volume, minimap preview without movement, confirmed travel, item-tool goals, offline asset decode and mobile layouts verified. Reviewed gameplay-scale animation screenshots. Runtime25artfiles/8.5MiB. Same-host Chrome benchmark close/far/overview median8.3ms,p958.5ms; chunk builds3/0/0; no steady distant thrash. Conditions as RENDER_BENCHMARK.md; no physical-mobile/FPS claim. Current allowance97%used/about3%remaining, no reset or paid API. G2world/staged quests/economy and G3ranged/V4 remain required; not claimed complete.

## Early-game journey — G2 gate

Organic4–7tile river with smooth bends, winding roads/irregular plazas,240 separate1×1choppable trees and actual bank-side fishing. Approved corrected2:1building proof and single-tree proof;7new original alpha assets/prompts/anchors saved under assets/generated/v4/. Walk-in service doorways/cutaway shells stay on the same world. Six staged original quests, both River Letters branches/timed local choices, practice commission,5coin ferry, specialized merchants and black/mithril milestones. UI exposes current objectives, inspection/talk/use, choices and ferry actions. Fixed partial-quest supply retrieval and a combat-preparation bank loop without discarding belongings.

Gate:144unit tests, strict production build, Pages-subpath/PWA32artfiles/9.5MiB pass. All21browser scenarios pass across corrected final runs, including offline assets/reload and1280×720/390×844/844×390. Same-host Chrome benchmark close/far/overview median8.3ms,p958.5ms; CanvasAPI CPU0.259/0.431/0.264ms per paint; chunk builds3/0/0. One fixed~4MiB tree composite refreshes only world/art/depletion changes. No physical-mobile claim. Reviewed journey-g2-world/overview screenshots. Internal branch only; V3public save remains untouched until final V4 rollout. Actual allowance98%used/about2%remaining; no reset or charges. G3ranged/autonomy/V4 still required. Prominent-message bottom log planned separately; routine XP/item gains stay as world feedback.

## Early-game journey — G3 local gate

Implemented Ranged, ordinary/oak/willow shortbows, bronze/iron/steel arrows, leather gear, three firing styles, legal line of sight/range positioning, atomic ammo/two-handed transfers and persistent seeded arrow recovery. Added armoured and ranged outlaws. Quest-led deterministic autonomy completes all six stories plus Ranged 5 in three tested seeds (1,7,981) within36,000ticks; an objective-progress watchdog preserves blocked user goals and backs off with a reason.

V4 storage copies the original V3 chronicle without overwriting the v3/v1 archives. Migration preserves belongings, XP, completed rewards, valid intentions and legal positions; changed terrain repairs actor/enemy/loot/grave routes without item loss. The real published4fb81c8 fixture is checked in for regressions.

Gate:158unit tests, strict production build and repository asset/PWA checks pass. All24browser scenarios pass across final corrected runs, including archery XP/ammo/styles/food, full-pack atomic rejection, original V3 record equality, reload, mobile and offline play. Reviewed journey-ranged.png. Final same-host Chrome benchmark: close/far/overview median8.3ms,p958.5ms; Canvas API CPU0.247/0.409/0.261ms per paint; sampled terrain chunk builds0/0/0. These are desktop measurements; no physical-mobile claim. Runtime32artfiles/9.5MiB. No remote runtime service or paid API introduced. Public deployment verification remains next.

### Final public verification — stop

Release4f018cb passed the complete GitHub pipeline and deployed successfully: https://github.com/cudldev/Fable-Crown/actions/runs/40895299762 . All24browser scenarios then passed directly against https://cudldev.github.io/Fable-Crown/ in1.7minutes: archery/ammo/styles, atomic equipment rejection, both save archives, original V3 migration without modifying its record, quests/ferry, interaction cycles, XP/items, minimap, audio fallback, mobile layouts and offline reload. Public artwork manifest9c22ec9f4301 exactly matches the local build:32files,9,931,268bytes. Public verification screenshots saved in docs/screenshots/.

All three approved gates are complete and the offline playable release is verified. Stop here. The collapsible bottom panel remains a planned follow-up for prominent messages; routine XP/item gains stay as world feedback. Optional narrative LLM and learned policies remain unimplemented. Final actual allowance:99%used/about1%remaining. No reset redemption, credit purchase or paid runtime API.

## Gameplay feel and Oakrest — Gate 1

Approved FEEL_AND_OAKREST.md implemented on codex/feel-oakrest. Authoritative legal movement traces drive piecewise rendering,8screen headings, continuous gait and bounded adjacent-snapshot buffering. Walking/running use actual mode even on a final single step. Ground anchors/body scale, depth, camera, shadows and hit targets share rendered position. Immediate worker receipts precede serialized saving; direct routes prepare on acceptance, rapid inventory actions retain order, and latest direct world orders preserve explicit queue entries. Normal next actions resume next tick; gameplay durations/XP unchanged.

V5 copies real V4/V3 fixtures while retaining old archive rows and personal progress. New effects/messages are strict empty contracts for Gate2. Original generated movement art/prompts/proofs/build pipeline saved under assets/generated/v5/:7drawn directions plus a mirroredNE yield72frame keys. Several passing poses are similar; do not claim72distinct poses. One art worker hit model capacity; another available model finished from saved sources. No reset was redeemed by this agent.

Gate:195unit tests pass; strict build/subpath/PWA checks pass. All27browser scenarios pass across corrected final runs; final6movement/ranged/migration cases pass with corrected artwork. Runtime39artfiles/12.2MiB. Same-host Chrome156 benchmark close/far/overview/walking-turn/running-turn median8.3ms,p958.5ms; Canvas API CPU0.329/0.434/0.259/0.139/0.133ms per paint; terrain chunk builds0throughout. Sustained turning small-canvas builds1walking/0running, no steady thrash. See benchmark script BENCH_TURNING=1. Physical-device performance unverified. Max4 concurrent unit workers prevents CPU contention in the bounded legacy planner case. Gate2/Gate3 remain required; public main unchanged.

## Gameplay feel and Oakrest — Gate 2

Authoritative bounded work/combat effects now drive preparation/contact/recovery, cosmetic arrows, committed hit/miss amounts and defeat reactions. Actual contact/gait crossings synchronize local audio. Original generated action sheets include84 keys across7actions/3phases/4diagonals, with mirrored alternatives; corrected waist-level cooking passed lead review. Depleted trees/ores leave solid props. Sources/prompts/proofs/build scripts remain in assets/generated/v5/.

Persistent100-entry prominent history supports All/Events/Dialogue and consecutive repeat counts; ordinary villagers approach and speak through deterministic Talk orders. Dialogue, quests, discoveries, real levelups and important blockers enter the panel; routine items/XP stay world feedback. Compact desktop/collapsed phone panel expands without pausing. Drawer/message/Thoughts positions and landscape camera controls were corrected after browser review.

Gate:223unit tests and strict production build/subpath/PWA pass. All30browser scenarios pass across final corrected runs (initial28/30, corrected4/4); one actual Thoughts-button occlusion fixed, one invalid reward ID in new QA fixture fixed. Reviewed desktop/portrait/landscape message screenshots and cooking proof. Runtime50artfiles/14.6MiB. Chrome156 same reference host: close/far/overview/walk-turn/run-turn p508.3ms,p958.5ms, Canvas API CPU0.307/0.330/0.205/0.142/0.138ms per paint; terrain chunk builds0 throughout; sustained turning small-canvas builds1/0. Physical-phone performance unmeasured. Actual allowance52%used/about48%remaining; no reset redemption or paid API. Gate3 remains required; public main unchanged.

## Gameplay feel and Oakrest — Gate 3 local integration

Authored paths now connect Oakrest’s manor approach, workshop yard, western woods, northeastern quarry, southern meadow/farm and western riverbank. Sparse fencing,3default-open functional gates,8readable signs and original generated crop/supply props keep every service/resource reachable even with all gates closed. Full256×192world,240tree positions and all progression IDs/rewards retained. Gate variants/path caches are immutable and separated; occupied closing rejects atomically and changed collisions clear obstructed routes/historical traces. Additive worldRevision2 migrates the real previous V5 fixture without losing belongings, goals, queue, XP or event history. Original V4/V3 archives remain intact.

Starting thoughts offer forge, hunting preparation and supplies/trade with a nonblocking forge default. Ren’s clues now give actual directions. Lead visual review enlarged crop beds and added an uneven quarry surface; approved screenshots cover all5district views plus phone layouts. Six new alpha props add351,030bytes. Runtime56artfiles/15,711,852bytes (~15.0MiB).

Gate:237unit tests and strict production build/Pages-subpath/PWA checks pass after final visual adjustments. All33browser scenarios pass across corrected runs (initial32/33, legacy exact quest-description expectation corrected, final3story and3Oakrest cases pass). Offline caching/reload, zero external runtime calls, mobile layouts, histories, gate persistence and real archives verified. Same-host Chrome156 final close/far/overview/walk-turn/run-turn p508.3ms,p958.5ms; Canvas API CPU0.385/0.285/0.202/0.144/0.145ms per paint, terrain chunk builds3/0/0/0/0; sustained-turn small-canvas builds0/0. Physical-device performance unmeasured.

All-gates-closed autonomous forge seeds1/7/981 took361/323/574ticks (3.61/3.23/5.74simulated minutes). One command-driven mixed seed7 journey used real bank transfers, gathered/cooked3shrimp, defeated1boar and delivered the forge once in562ticks/5.62simulated minutes;398movement steps legal, finalsave valid,8HP, no meal consumed. The10–15minute reference target was not reached; no artificial delays or reward grants added. Further pacing/balance tuning belongs to later user playtesting. Publication verification remains next; no reset redemption or paid runtime API.

Active-world final benchmark (1200simticks,1330NPC work completions at import): close/far/overview p958.5ms; Canvas API CPU0.318/0.312/0.203ms per paint; terrain chunk builds0/0/0, far/overview small-canvas builds0. Local release gate accepted; next action publish and verify actual Pages.

### Public release verification — stop

Releasebad2783 passed every GitHub deployment gate: https://github.com/cudldev/Fable-Crown/actions/runs/40946581923 . Verified public index-BVYo2LBb.js and exact artwork manifest6d1d153b2395:56files/15,711,852bytes. All33acceptance scenarios then passed directly against https://cudldev.github.io/Fable-Crown/ in2.5minutes, including realV3/V4 archive preservation, newstarterchoice, gateclose/open/reload, signhistory, prominentmessages, offlineassets/reload, phoneorientations, inventory/XP/actions/running/ranged/quests/ferry and audiofallback. Live screenshots retained under docs/screenshots/.

Allthree approved implementation gates are accepted and the playable public demo is verified. Mixed-reference pacing remains5.62simulated minutes in one measured run rather than the10–15minute target; physicalphone performance, richer daily social schedules, learning policies and optional narrativeLLM remain outside this release. Finalactualallowance53%used/about47%remaining. No reset redeemed, credits purchased or paid runtimeAPI introduced. Stop here.
