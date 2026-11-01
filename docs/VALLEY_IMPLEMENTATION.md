# Valley onboarding — approved 2026-11-01

The new default chapter is hands-on: safe valley → freely placed tent → earning and royal account → cottage → optional public projects. Days1–3 follow progress, including early payment, long sessions and late returns; no calendar lock or second required home. Earlier autonomous chapters remain at `?chapter=legacy` (also linked from More).

## Fixed first balance

- 60Hz continuous actions/collision; 600ms background settlement. Per-press strikes, forward aim assistance. Guard100; blocked hit25; regeneration20/sec after0.75sec released; break0.75sec; guarded movement50%.
- WASD/E/mouse, standard controller and virtual joystick. Camera follows with pan/zoom/Follow; Back closes the top interface. Explicit craft batches are bounded routines.
- Safe valley80×48 (8..87,136..183); owned64×32 (16..79,144..175). Pond/original destinations preserved. Home reserves10×8, freely rotated; immediate tent has bedroll and connected storage. Wilderness is marked and optional.
- Paths/planting, protected pads/shore/routes, ±0.5m original terrain, four-tread steps, previews and32-entry undo. Ground edits give no resources/XP.
- Start25 coins; first bill100; three one-off40-coin commissions, partial payment, no deadline/interest/arrears. Full payment commissions9000 settlement ticks (90 active minutes/~6h offline). No assistance/speed-up chores.
- Six Carpentry furnishings: stool,table,bed,shelf,chest,planter. Cottage has workbench/planning table. Optional forge12logs+2bronze bars,1800ticks (18min); bronze smelting5→4ticks.
- Daily timber help/orders and date-rotating decoration stock supplement ordinary trade. Rowan/Pella/Garrick dialogue follows actual progress. Day2 offers garden/steps; day3 offers optional forge, furnishing, production and wilderness goals. Further homes/grants are inspectable future opportunities.
- Defeat preserves equipped gear, skills, storage and paid tribute. Backpack recovery persists across repeated defeats, partial collection and reload. Offline construction25%, cap24h; no offline combat. Numerical defaults have not been changed without playtest evidence.

## Execution and contracts

Isolated checkout `tmp/valley-onboarding`, branch `codex/valley-onboarding`, base665e597. Other authoring/release workspaces remain untouched. At most lead+two specialists; builds/GPU serialized. No model switches, paid APIs, credits or reset redemption.

| Tasks | Actual owner | Handback |
|---|---|---|
| T0,T8,T13 | Lead `/root` | Contracts, worker/V6 storage, integration, docs, gates/release |
| T1,T3 | `/root/motion` | Pure action simulation; deterministic motion/combat/bridge tests |
| T2,T9,T11 | `/root/controls` | Input, ValleyApp, camera/interpolation, terrain presentation, responsive interfaces |
| T4 | `/root/world` | Valley, ownership, footprints, support, terrain, route validation |
| T5 | `/root/art` | Editable native VOX, pixel poses, provenance, native audits and runtime review |
| T6,T7,T10 | `/root/gameplay` | Craft/trade/account/projects, progress guidance, visitors and tests |
| T12 | `/root/qa` | Independent worker/offline, real browser/IndexedDB/controller/touch/recovery and release checks |

Lead owns shared types, engine integration, valley contracts, worker/storage, release and progress. Specialist files were handed back before lead edits; no simultaneous shared-file ownership.

V6 is an additive envelope: V5 chapter + action state + valley state + savedAt/fractional background remainder. V3–V5 archives remain untouched. Migrated belongings/skills/history enter at the safe grant entrance; no old rewards replay. Writes retain the last valid V6 backup. Invalid archives never overwrite stored progress. Known valley effect targets are checked alongside the strict V5 validator.

## Gates and evidence

Foundation/action/valley/home/onboarding gates are integrated. Baseline537 units/type/build passed; action checkpointf7e6ca5 had569 units and3 real WebGL cases. Current release evidence: `PROGRESS.md`, `valley-qa.md`, source `native-audit.json`/`in-game-review.json`, `docs/screenshots/valley-*` and `performance/valley/metrics.json`. CI retains exactly2 non-GPU cases; local GPU checks remain `test:visual`.

Release gate: passing strict types/unit/build/native/baked/dist checks, production repo-subpath browser/PWA/upgrade tests, reviewed actual assets and public verification. Preserve previous public release until these pass. Stop after this vertical slice for human balance/device playtesting; no further milestone expansion.
