# Floating UI / glass vial review — 2026-10-31

Floating health/work/name labels and damage/XP/item/level text have transparent backgrounds and no panel borders. A small text halo supplies contrast. The progress tube is now nine pixels tall (previously seven), with a transparent glass track, one-pixel edge, restrained directional shading and a small rounded front reflection inspired by the user's health-globe reference. The front sheen overlays the empty glass too; its position/tint reuse existing CSS light values. Measurements below predate this CSS-only refinement.

`FloatingVials` reuses the resolved scene sun, sky fill and at most four selected point lights. Each visible bar samples its actual actor position at most every100ms; unchanged rounded colors skip DOM writes. The liquid keeps80%of its role color, supplying a readability floor. The glass edge and highlight follow scene color/direction, including the day cycle and local lamp flicker. This is a cosmetic lighting approximation: no shadow/GI queries, reflections, backdrop filters, extra scene objects or GPU captures. It does not illuminate the world.

Reproduce with `node scripts/review-floating-ui.mjs before`, then the changed build and `after-isolated`; run `tint-cpu` for the isolated helper. Builds must use `/Fable-Crown/`. Serialize frame measurements with other browser/test workloads.

Host: i9-10850K, real Chrome/WebGL. Four-lamp CPU probe with changing light and real DOM style writes:1/8/32bars average0.0018/0.0101/0.0342ms per lighting update;32-bar p95 block average0.05ms. Excludes deferred style/layout/paint. At10Hz this is a bounded CPU contribution, not a physical-phone guarantee.

Whole-game warm480-frame samples include rendering and CSS painting. Desktop mean8.38→8.64ms,p95 8.5→8.5ms;390px phone viewport mean8.34→8.34ms,p95 8.4→8.5ms. Desktop after-p99 rose8.5→16.7ms. NPCs continue moving, samples are short, and small draw-count differences occur; these do not prove universal frame-time parity or identify the tail cause. `after.json` overlapped browser tests and is excluded; use `after-isolated.json`.

Actual day/night/forge/phone/work/reward/combat images: `docs/screenshots/floating-ui/`. Local browser coverage verifies world-light changes, transparent real-event floaters, readable bar presentation, victim attachment and mobile bounds. Keep these GPU cases in local visual testing.
