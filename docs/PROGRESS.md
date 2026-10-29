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
