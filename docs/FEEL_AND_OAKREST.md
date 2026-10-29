# Approved gameplay feel and Oakrest release

Current user-approved scope: natural Alden movement first; OSRS tick rhythm with smooth painterly visuals; autonomous play with direct overrides; mixed village adventure; compact expandable prominent-message panel. Preserve the entire256×192 world, original art direction, all progression and old save archives. No new skills, Magic/Prayer, dungeons, hosted services or runtime APIs in this release.

Sequential gates:
1. Natural movement and responsive control. Actual legal per-tick movement traces,8screen directions for Alden, up to4walk/run frames per cycle, continuous gait and grounded pivots. NPCs reuse current art. Immediate accepted/rejected receipts, next-eligible-tick direct actions, rapid inventory actions execute in order. Introduce V5 copying V4/V3, retaining every archive and personal belonging.
2. Work preparation/contact/recovery, authoritative combat/action effects, cosmetic projectiles/hit/defeat reactions, stumps/exhausted rocks and synchronized audio. Persistent100-entry prominent log with All/Events/Dialogue, consecutive identical-message merge within50ticks. Exclude routine XP/items/action starts; preserve world floaters/rings. Desktop two-line strip, phone collapsed Messages control; history never pauses gameplay.
3. Authored Oakrest district x8–119,y48–143: village/manor/workshop, western woods, northeastern quarry, southern meadow/farm and western riverbank. Distinct plots, functional gates/fences/signs, original bounded prop art. Stable service/resource/enemy/quest IDs;240single-tile trees globally. Improve Ren's flavour/clues without changing quest stages, requirements or rewards. Offer forge, hunting preparation and supplies/trade starting ambitions.

Reference journey target10–15minutes: inspect forge task, gather, bank, produce, prepare food, optional wildlife encounter, return/deliver. Tune from observation; no invented completion guarantee. Starter choices remain optional and world remains open.

Contracts: ActorState.movement records tick/mode/start+up-to-two legal steps; RpgState V5 includes bounded64 sequenced effects and100 prominent messages; worker receipts carry requestId/accepted/message/tick. Presentation ignores old effects on initial load, import, teleport or offline catch-up. No UI frame determines gameplay. Actor-frame cache max96cells, each at most256×256.

Lead owns shared types/UI/worker/storage/docs/integration; High simulation specialist owns engine and core tests; Medium renderer owns rendering/presentation; Medium art owns original images/atlas metadata. Bounded QA after contracts stabilize. No simultaneous edits to the same file; serialize builds. Gate each stage with units, strict build, relevant browser/mobile/offline and benchmarks. Final close/far/overview target p95≤20ms on documented reference host and no steady far terrain-cache rebuilding; no physical-phone claim without measurements.

V5 reads/migrates V4 or V3 but writes only v5; keep v4/v3/v1 unchanged/exportable. Preserve valid goals/orders/queue and legal positions; repair changed-terrain routes/blocked actor/enemy/loot/grave positions without loss. Invalid commands remain non-mutating.

Later roadmap: intention policies → interconnected Crafting/Fletching/Firemaking economy → Magic/Prayer and richer encounters → original quest chapter → levels30–50. Do not start these during this release. Verify live Pages, record results/usage, then stop. No reset redemption or purchases; checkpoint at actual allowance exhaustion.
