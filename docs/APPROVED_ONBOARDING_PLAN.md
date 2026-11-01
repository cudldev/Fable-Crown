# Fable Crown onboarding and agent implementation plan

Audit source: the user-approved plan below. Later user instruction supersedes save migration: “We can start fresh with saves, don't try to migrate them as this' a major change.” Current valley saves use format7 and separate storage; old archives are not converted.

## 1. Game design and three-day journey

The player receives a mostly empty valley, chooses a home site and immediately establishes a tent. Gathering, crafting and trade fund the first royal payment, which commissions a cottage. The finished cottage enables organising optional settlement projects.

Design for roughly one hour per visit. Players can continue progressing in longer sessions; days describe the expected journey rather than locked chapters.

### Day 1 — Establish camp

- A travelling builder introduces the grant, owned land, safe valley and wilderness exits.
- The player freely chooses a valid home position within the owned area. Placement previews reserve enough room for the future cottage.
- The tent appears immediately, with a bedroll and personal storage.
- A short practical sequence teaches tool swings, collecting timber, crafting a stool and placing it.
- Introduce the settlement account and three earning opportunities: timber, furniture and fishing commissions.
- Provide basic trading and crafting through the builder’s caravan.
- Offer paths, planting and optional wilderness exploration.
- Payment can happen whenever the player has sufficient money. Settling the account commissions the cottage.

### Day 2 — Establish a home

- Summarise construction progress and today’s visitor.
- When complete, the cottage provides a personal workbench and planning table.
- Preserve storage and campsite possessions; packing the tent never deletes belongings.
- Introduce the remaining starter furniture recipes and a merchant with useful supplies, decorations and paid requests.
- Teach limited terraforming through an optional garden-and-steps activity.
- Reveal the communal forge project, its requirements and benefits. Participation remains optional.

### Day 3 — Choose a direction

- A visiting smith introduces fresh commissions and the potential forge.
- Let the player focus on furnishing, landscaping, producing goods, contributing to the forge or wilderness exploration.
- Show physical results from deliveries, completed buildings and placed furnishings.
- Let the player pin a next goal and inspect future housing and land opportunities.
- Permanent resident housing follows later; onboarding does not require a second home.

If the player progresses slowly, guidance follows their actual state. Visitors and dialogue never assume a payment or building completion occurred on schedule.

## 2. Mechanical specification and initial defaults

**Continuous actions**

- Run movement, collision, tool strikes, attacks, blocking and hit detection at **60Hz**, with continuous positions and interpolated rendering.
- Retain **600ms ticks** for background production, commissioned construction and settlement decisions.
- Each press performs one tool or weapon swing. Holding does not repeat strikes by default.
- Movement sets facing; attacks gently assist toward nearby targets in front.
- Blocking uses guard stamina: initial capacity 100, basic blocked-hit cost 25, regeneration 20/second after releasing for 0.75 seconds, and a 0.75-second guard break at zero. Blocking halves movement speed.
- Prototype and measure action responsiveness before committing to the full content build. Consider lower action rates only if measurements justify them.

**Inputs**

| Action | Keyboard/mouse | Gamepad | Mobile |
|---|---|---|---|
| Move | WASD | Left stick | Virtual joystick |
| Interact | E | South face button | Interact |
| Tool/attack | Left mouse | Right trigger | Tool/Attack |
| Block | Hold right mouse | Hold left trigger | Hold Block |
| Inventory/building | Labelled menus | Navigable menus | Touch menus |

Use a following isometric camera with pan, zoom and a visible Follow control. Escape/Back closes the top interface first. Optional automation requires an explicitly chosen bounded task.

**Valley and terraforming**

- Use the empty southwestern overworld region for an approximately **80×48-tile safe valley**, containing a **64×32-tile owned building area**.
- Preserve the pond and existing destinations. Provide safe beginner resources and clearly marked wilderness exits.
- Allow paths, planting, suitable vegetation removal, steps and terrain edits one **0.5m terrace** above or below original elevation.
- Keep water fixed. Protect occupied building pads, entrances, shorelines and essential routes.
- Provide previews and undo. Terrain edits generate neither saleable resources nor repeatable XP.

**Economy and construction**

- First bill: **100 coins**, including cottage materials and commissioned construction.
- Starting money: **25 coins**.
- Three introductory commissions: **40 coins each**, available once each.
- Accept partial payments; full payment commissions the cottage. No deadline, interest or arrears.
- Use one settlement account for royal payments and development records.
- Cottage: **90 minutes of ordinary simulation work**, approximately six hours away at quarter-speed offline progress.
- No construction assistance or speed-up chores. Resource activities remain available while builders work.
- Add Carpentry and six starter furnishings: stool, table, bed, shelf, chest and planter.
- First optional forge: twelve logs, two bronze bars and eighteen minutes of commissioned construction. Its benefit reduces bronze smelting from five settlement ticks to four.
- Daily resource assistance, fresh commissions and rotating visitor stock supplement unrestricted ordinary earning.

**Wilderness**

Combat is always optional for essential settlement progression. Enemies and damaging attacks cannot cross into the valley.

Defeat returns the player home with equipped gear and skills intact. Backpack contents remain at a persistent recovery marker. Stored possessions and paid tribute remain safe. Support partial collection and repeated defeats without deleting earlier belongings. Combat does not advance unattended while offline.

These numerical values are the first implementation balance; subsequent adjustments require recorded playtest evidence.

## 3. Implementation tasks and agent ownership

These are specialist roles used across successive sessions, not seven simultaneous agents.

| ID | Owner | Implementation task | Depends on | Required handback |
|---|---|---|---|---|
| T0 | **Lead / integration agent** | Preserve the current workspace, establish an isolated implementation checkout, run baseline checks, update authoritative design instructions and define shared contracts. | — | Baseline report, dependency board, interfaces, ownership map and checkpoint. |
| T1 | **Motion and combat agent** | Implement deterministic 60Hz continuous movement, collision, facing and the relationship with 600ms settlement ticks. Prevent legacy tile movement from also moving the player. | T0 | Pure simulation modules and tests for movement, collision and tick consistency. |
| T2 | **UI and rendering agent** | Implement keyboard, mouse, gamepad and virtual-joystick input; camera controls; interpolation; focus handling and immediate feedback. | T1 contracts | Playable movement prototype on all three input methods. |
| T3 | **Motion and combat agent** | Add per-press tool strikes, attacks, gentle targeting, guard stamina, enemy telegraphs, safe-zone enforcement and defeat/recovery behaviour. | T1, T2 | Playable action prototype and deterministic combat/tool tests. |
| T4 | **World and terrain agent** | Author the valley, ownership mask, resource locations and exits. Implement shared ground support, terrace edits, stairs, placement validation and navigation invalidation. | Action gate | Valley modules and terrain/path/placement tests. |
| T5 | **Art agent** | Produce original tent, cottage stages, forge stages, six furnishings, landscaping elements and required strike/block poses. Reuse accepted assets where suitable. | Approved footprints and action states | Editable sources, provenance, runtime assets and actual visual-review captures. |
| T6 | **Gameplay and onboarding agent** | Implement resource interactions, Carpentry, furniture recipes, commissions, ordinary sales and starter-service availability. | T3, T4 | Tested gathering→crafting→selling loop with resource conservation. |
| T7 | **Gameplay and onboarding agent** | Implement settlement payments, cottage commissioning, construction progress, planning-table capability and optional forge project. | T6 | Tested account and project modules; exact-once payment and completion behaviour. |
| T8 | **Lead / integration agent** | Integrate worker commands and snapshots, new save version, migrations, terrain/building persistence and offline construction. | T3, T4, T7 | Migration fixtures, deterministic replay and idempotent offline tests. |
| T9 | **UI and rendering agent** | Build home placement, furniture placement, terrain editing, inventory, account, construction and project interfaces. | T4, T7 contracts | Complete responsive interfaces with controller navigation and touch alternatives. |
| T10 | **Gameplay and onboarding agent** | Implement progress-based day 1–3 guidance, visitor introductions, daily resource help, recurring opportunities and optional wilderness introduction. | T7, T8 | Content definitions and tests for early, late and out-of-order progress. |
| T11 | **UI and rendering agent** | Integrate tutorial prompts, contextual controls, return summaries, visitor interactions and goal pinning. | T9, T10 | Playable three-day reference journey without forced tutorial interruptions. |
| T12 | **QA and art-review agent** | Independently exercise the journey, controller/touch controls, terrain, economy, recovery, saves and actual rendered assets. | Relevant task handoffs | Reproduction steps, test results, captures and measured performance report. |
| T13 | **Lead / integration agent** | Resolve findings, run final gates, prepare the release candidate and perform publication/live verification under existing authorization. | All acceptance gates | Integrated checkpoint, progress notes, release evidence and remaining limitations. |

Each implementation agent writes meaningful unit tests for its own logic. QA independently tests the integrated behaviour rather than waiting until the end to discover integration problems.

## 4. Ownership and execution gates

**Shared ownership rules**

- The lead exclusively owns shared types in `src/rpg/types.ts`, integration changes in `src/rpg/engine.ts`, worker protocol, storage/migrations, build/release configuration and progress records.
- The UI/rendering agent owns `src/rpg/RpgApp.tsx` and assigned input, UI and renderer modules.
- Motion, world and gameplay agents own separate feature modules. They request shared-contract changes through the lead.
- The art agent owns assigned source/runtime asset directories. Runtime bindings and generated-package publication are integrated by the lead.
- QA owns assigned tests and reports. It reports implementation fixes to the responsible owner.
- No two active agents edit the same file. Ownership transfers only after a handoff.

**Execution order**

1. **Foundation gate:** T0 establishes a passing baseline and contracts.
2. **Action gate:** T1–T3 must produce responsive movement, strikes and blocking before settlement content expands.
3. **Valley gate:** T4 and the first reviewed T5 samples establish terrain, placement and common scale.
4. **Home gate:** T6–T9 produce a saved, playable tent→payment→cottage loop.
5. **Onboarding gate:** T10–T12 complete and verify the three-day experience.
6. **Release gate:** T13 integrates and verifies one complete vertical slice, then stops for playtesting.

Use at most **the lead plus two specialists** at once. Start with bounded work and verify actual remaining allowance before expanding concurrency. Serialize builds and GPU checks. The lead alone controls any shared Blender session.

Art creation and review follow the applicable voxel/3D and pixel-character skills. Actual geometry, animation and gameplay-scale appearance must pass review; successful export is insufficient.

Agent handoffs include owned files, changed contracts, commands/results, captures where relevant, known issues and the next integration step. Use supported available models without automatic model changes or paid API calls.

## 5. Validation, compatibility and release

Preserve the current playable release until its replacement passes its gates. Introduce a new save version while retaining older chapters, belongings, skills and completed quest history. Migrations must not replay rewards.

Required scenarios include:

- Responsive continuous movement without tile snapping or duplicated movement updates.
- Per-press strikes, guard drain/recovery/break and wilderness boundary enforcement.
- Complete peaceful and mixed wilderness journeys.
- Early payment, extended sessions, missed days and delayed construction.
- Terrain edits around stairs, entrances, objects and occupied footprints.
- No duplicate payments, deliveries, gifts, construction rewards or inventory.
- Persistent backpack recovery after repeated defeats and save/reload.
- Correct background construction and idempotent offline reconciliation.
- Keyboard, gamepad and touch controls in both mobile orientations.

Run unit, strict type, build, asset and distribution checks. Keep `test:release` lightweight; run GPU interactions, screenshots and performance comparisons locally with `test:visual`.

Retain the approved voxel environment, pixel cast, zero-cost offline baseline and GitHub Pages deployment. Verify actual public asset paths, PWA scope, cached upgrades, saved progress, offline reload and WebGL gameplay after publishing. Report measured performance and actual remaining usage without extrapolating from historical figures.
