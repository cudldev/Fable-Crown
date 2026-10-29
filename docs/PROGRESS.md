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

Initial Actions passed install/checks/build, then failed because Pages was not yet enabled. Repository is created, Pages source is now Actions; final deployment verification follows the next push.

## Limits and deferred scope

Illustrated placeholders are simpler than production paintings. No physical phone/GPU/FPS benchmark claimed. Offline proof of concept uses bounded deterministic tick replay, not the future analytical resolver. Calendar records local date; daily events/seasons deferred. Use one game tab; no cloud sync. Local LLM, combat, scaling, expanded towns and production art deferred by stop rule.

## Ownership and budget

Lead: contracts, infrastructure, UI, saves, integration, QA/deployment. Simulation specialist: simulation/tests. Art specialist: one bounded scene refinement. No model changes.

Usage read at start:13% weekly remaining; latest:12% remaining. No scheduled/banked reset used. Inside110% planning ceiling. Finish at verified playable Pages demo, then stop.
