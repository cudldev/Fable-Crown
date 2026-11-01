# Approved valley plan — completion audit

Scope: [approved sections 1–5](APPROVED_ONBOARDING_PLAN.md), with the later **fresh-save override**. Format7 uses `valley-v1`/backup; V3–V6 keys stay untouched and older files are rejected. Migration clauses are superseded, not incomplete requirements.

This maps implemented acceptance requirements to evidence. Local candidate **c35e76d491e5** passed **10 functional GPU cases and 2 non-GPU release/PWA cases**, serialized on the production repository base path. The lead reports **692 passing units/82 files**, strict types, build/native/baked/dist gates. **Established** identifies the evidence below; **weak** identifies broader human observations not demonstrated. Published cache `141aac213cf0` remains historical evidence until the lead verifies the new public artifact.

Days1–3 are progress checkpoints, not a demand to spend three wall-clock days testing. Physical-device and hour-long pacing observations are human playtest follow-ups; they do not substitute for the listed deterministic/reference checks.

## 1. Journey and content

| Explicit requirement | Evidence | Assessment |
|---|---|---|
| Mostly empty grant; freely choose home; immediate tent; gathering/crafting/trade fund cottage; later projects | `src/valley/{world,settlement,content}.ts`; `tests/rpg-valley.spec.ts`; `tests/valley-gameplay.test.ts`; new `tests/valley-reference-journey.test.ts` | Segments and two fresh reference simulations established; both are included in the lead-reported passing unit gate. |
| Roughly hour-long visits; longer sessions allowed; days follow progress | `getOnboarding` and `tests/valley-onboarding.test.ts` test early/late/out-of-order progress | No calendar lock established. **Weak:** no recorded hour-long pacing/balance playtest. |
| Builder explains grant, ownership, safety and wilderness | Rowan dialogue in `onboarding.ts`; entrance/wilderness signs in `world.ts`; nearby-conversation unit test | Code/unit evidence; no forced introductory modal. |
| Valid owned home choice and future-cottage preview | `homeFootprints`, placement validation; world/rotation tests; actual placement browser case | Established; all four rotated native doors have separate runtime captures. New furnishing/move/forge-under-player guards reject collision softlocks atomically in gameplay tests. |
| Immediate tent with bedroll and personal storage | Native tent source/brief; `bankNearby`; connected-storage unit/browser tests | Bedroll appearance and functional shared storage established; no healing mechanic claimed. |
| Practical tool→timber→stool→placement teaching | Six state-grounded day-one steps; actual tree-press case; new fresh reference simulation follows the full chain without fixture grants/teleports | Mechanics/reference sequence established. Novice UI learnability remains untested. |
| Settlement account; timber/furniture/fishing earning; basic caravan trade/craft access | Three one-off commissions/prices; real craft/sale browser case; new resource-conserving caravan-proximity workbench regression | Trade and basic workbench recipes at the caravan established. Cottage-only recipes retain their gates; current candidate gates pass. |
| Paths, planting and optional wilderness; pay whenever affordable to commission cottage | World/settlement tests; payment browser case; no combat requirement in account code | Established. |
| Day-two return summary names progress and today's visitor | `offline.ts`; partial-construction/visitor unit test; worker renders summary through `.valley-message` | Established: partial-minute/visitor unit checks and actual controller-browser return-summary assertion. |
| Complete cottage has personal workbench/planning table | Shared footprint sockets, world service objects, worker service routing; all-rotation personal-workbench unit test; native interior review | Established code/unit/art evidence; no claim that a button substitutes for the physical station. |
| Storage/campsite possessions survive packing tent | Pack flag changes geometry only; connected-storage conservation tests; worker chooses unpacked tent/cottage return point | Established code/unit evidence. |
| Remaining starter recipes; merchant supplies/decorations/paid requests | Six furnishings, cottage gates, Pella offers/date rotation; economy/onboarding tests | Established. |
| Optional garden-and-steps lesson; optional forge requirements and benefit | Day-two help text, Ground & garden UI; protected edits/undo; forge delivery/smelting tests | Established in code/unit and terrain/art fixtures; no recorded novice garden playtest. |
| Day-three smith fresh commissions; five directions; pin next goal | Garrick/daily-smith content; `VALLEY_DIRECTIONS`; Journal direction buttons | Established: controller case pins all five and verifies the actual current-goal text. |
| Physical delivery/building/furnishing results | World geometry keys/stages; real payment/craft/placement checks; native tent/cottage/forge captures | Established; time transitions use deterministic tick/offline tests. |
| Inspect future housing/land; resident housing later; no second required home | `FUTURE_GRANTS` Home cards show benefits and “Later”, with no purchase actions | Established: controller reaches Home and inspects all three “Later” cards without purchase controls; no resident settlement/unlock is claimed. |
| Slow/early/late players get truthful guidance/dialogue | `getOnboarding`, `getVisitors`; date-independent/out-of-order tests and current-state dialogue tests | Established code/unit evidence. |

## 2. Mechanics and initial balance

| Explicit requirement | Evidence | Assessment |
|---|---|---|
| 60Hz continuous movement/collision/strikes/attacks/blocking/hits; interpolated render; no double tile movement | `src/action/{contracts,simulation,rpg-adapter}.ts`, worker, renderer; action simulation/bridge/worker tests; actual continuous-position checks | Established deterministic simulation and DOM/worker evidence, supplemented by the bounded actual playback review below. |
| 600ms settlement/production/construction; explicit bounded automation | Integer settlement batches and reserved quantity-limited craft queue; worker fractional-time tests | Established; no unattended action/combat catch-up. |
| One swing per press; no hold-repeat; movement-facing; gentle forward targeting | Action contact/cooldown/aim tests; real held tool case; actual controller RT damage proof added | Tool path and current controller Y/RT Weapon route established. |
| Guard100; hit25; regen20/sec after0.75s release; break0.75s; half speed | Exact constants/step tests, including held-break no-regen regression | Exact unit values and actual LT blocked-hit/HP preservation established. |
| Prototype responsiveness measured before content; reduce action rate only with evidence | Action checkpoint `f7e6ca5` in implementation record; `performance/action-onboarding`; current `performance/valley` | Established small local proxy samples. No physical-phone/screen-to-photon claim or action-rate reduction. |
| WASD/left stick/joystick; E/south/Interact; mouse/RT/Tool; RMB/LT/Block; labelled/navigable/touch menus | Hook/input tests; prior keyboard/emulated-pad/touch browser checks; new Y/RT/LT/D-pad Settings case | Current Y/RT/LT/Settings routes established in the standard-pad emulator. Physical controller untested. |
| Isometric follow/pan/zoom; visible Follow; Escape/Back closes top interface | Camera UI/hook; mobile Follow bounds tests; menu-clear test; new controller zoom/pan/Follow assertions | Keyboard/touch plus current controller pan/zoom/Follow/mode/Back/disclosure and Tab-wrap proof established. |
| Safe80×48, owned64×32 in southwest; pond/destinations preserved; safe resources/marked exits | Bounds8..87/136..183 and16..79/144..175; original-object/collision/pond preservation tests; static resource/sign content | Established. |
| Paths, planting, suitable vegetation removal, steps, ±0.5m terraces | `world.ts`, plant/lift commands; bounds/support/conservation tests; exact four-tread terrain rendering | Code/unit/art evidence; direct vegetation-lift UI exercise is weak. |
| Fixed water; protected occupied pads/entrances/shores/routes; previews/undo; no saleable terrain output/repeat XP | World rejection/connectivity/32-entry undo tests; UI preview code; inventory/XP conservation tests | Established unit/geometry evidence; not every rejection path has an integrated browser case. |
| Start25; bill100 includes materials/build; three one-off40 payments; partial/full account; no deadline/interest/arrears | Content/constants; exact-once/failure-atomicity tests; real partial/full payment; fresh-storage tests | Established. No periodic charge/arrears path exists. |
| Cottage9000 ticks/90active min/~6h offline; no speed-up chores; resource work remains available | Settlement/offline tests at0/1/6/24/72h; no-assistance conservation test; actual gathering/crafting during incomplete construction fixtures | Established; no ninety-minute wall-clock playtest claimed. |
| Carpentry; stool/table/bed/shelf/chest/planter; exact forge12logs+2bars/1800ticks; smelting5→4 | Content recipes, craft reservation/XP/storage tests, forge materials/timing test; native furnishing/forge sources | Established. This requires six furnishings, not implementation of every historical gear SKU. |
| Daily resource aid, fresh commissions and rotating stock supplement ordinary earning | Daily-help/commission rollback/idempotence tests; visitor-stock date tests; unrestricted ordinary sale code | Established. |
| Essential progression peaceful; enemy/attacks cannot cross valley boundary | Account/craft code has no combat gates; safe-strip/leash tests; new reference journeys earn105 coins, pay100, build/furnish and reach day3, with optional strike/block and no combat reward | Full bounded peaceful/mixed reference simulations established; no uninterrupted human session claimed. |
| Defeat returns home; gear/skills/storage/paid tribute safe; persistent backpack, partial/repeated recovery; no offline combat | `tests/rpg-valley-action.spec.ts` real1HP deaths/merge/27-slot recovery/reload; action bridge and offline tests | Established controlled-scenario evidence; no natural multi-hour wilderness playtest claimed. |
| Numerical defaults change only after recorded playtest evidence | Approved constants match code/tests | No balance adjustment claimed; hour-long human balance/device testing remains follow-up. |

## 3. Task ownership and handbacks

| Task | Evidence and current limit |
|---|---|
| T0 foundation | Isolated `tmp/valley-onboarding`, baseline537 and contracts/ownership recorded in `VALLEY_IMPLEMENTATION.md`. |
| T1 continuous deterministic motion | Pure action modules; movement/collision/replay/tick tests. |
| T2 input/rendering prototype | Hook, continuous renderer and three-input prototype evidence; current controller route additions pass direct checks. |
| T3 combat/tools/recovery | Contact/aim/guard/telegraph/safety tests; actual recovery and tool persistence. |
| T4 valley/terrain | Shared ground/support, masks, edit/placement/routes, geometry invalidation and tests; new player-body overlap checks prevent furniture/move/forge scaffold entrapment. |
| T5 original assets | Editable VOX/pixel sources and provenance; native audits and actual usable-draft review. Caveats below. |
| T6 economic loop | Gather/craft/sell and conservation tests; six furnishing recipes; fresh reference journeys earn rather than inject supplies/money. No broader gear catalog inferred. |
| T7 account/projects | Partial/full account, exact timers/materials, personal stations and forge benefit tests. |
| T8 worker/storage/offline | Current7 storage isolation/import/backup and deterministic action/settlement tests. Migration handback superseded by explicit fresh-start instruction. |
| T9 interfaces | Home/furniture/terrain/bag/account/projects, mobile alternatives and controller menu machinery. Settings/Weapon and closed-disclosure focus wrap pass direct checks. |
| T10 progress/visitors | State-grounded days, early/late/long-session logic, daily help/requests and optional wilderness prompts. |
| T11 tutorial/summary/pins | Optional Journal/contextual UI; detailed return summary, five pins and future inspection pass direct checks. |
| T12 independent QA | Actual worker/IDB, controls, economy/recovery and release cases; reproducible bugs reported to lead/owners. No implementation edits by this audit. |
| T13 integration/release | Lead-reported692 units/type/build/native/baked/dist plus current10 functional GPU/2 release cases pass. New public artifact verification remains lead-owned. |

## 4. Ownership, execution and art gates

| Requirement | Evidence/qualification |
|---|---|
| Lead owns shared contracts/engine/worker/storage/release; specialists own separate modules; fixes reported through lead; explicit handoffs | `AGENTS.md`, `VALLEY_IMPLEMENTATION.md` ownership map and handbacks; current controls/offline/audit files assigned separately. Documentation is evidence of the protocol, not a complete historical concurrency trace. |
| Foundation→action→valley→home→onboarding→release ordering; runnable/tested gates | Baseline/action checkpoints and later gate results recorded in implementation/progress/QA notes. New completion-audit corrections are not treated as already released. |
| Lead+two specialists maximum; bounded work/allowance checks; serialized builds/GPU; lead Blender control; supported models/no paid calls | Current root/controls/QA partition and serialized test handoff; prior progress records. No automatic model change/credit/reset is part of this audit. A complete historical concurrency log was not independently reconstructed. |
| Applicable native/pixel workflows; actual geometry/animation/game-scale review; export success insufficient | `assets/source/voxel/valley-onboarding/{inventory,native-audit,in-game-review}.json`, provenance and `docs/art-audit/valley-onboarding/README.md`. Usable drafts only; Blender addon was unavailable, and no successful Blender review is claimed. |
| Art acceptance limits stay explicit | Native floors/doors/scale and clear shield/contact poses reviewed. Roof repetition/coarse small plants and partial actor occlusion at rotated cottage1/2 remain documented. Bounded actual playback is now reviewed below; neither those samples nor the stills prove every tool/pose/full-cast animation. |
| Handback files/contracts/results/captures/issues/next step; independent testing throughout | `valley-qa.md`, native review records and current audit; prior QA found coordinate event crash, menu-edge bounce, gather-effect save rejection, unreachable controller Weapon and the closed-details focus trap. The focus trap is fixed and directly regression-tested. Each owner received the reproduction. |

### Bounded actual animation playback review

Method: followed [pixel character](../skills/fable-pixel-characters/SKILL.md) and [3D visual-review](../skills/fable-3d-art/references/review.md) guidance, using the current Alden crop/style references. No art/renderer edits. Inspected all **15 unedited production WebGL crops** in [valley-playback](screenshots/valley-playback/samples.json), over about3.7s of sampled playback at1280×800. Metadata is read before screenshots; capture delay is not animation timing or a performance measurement.

Observed idle→continuous locomotion→upright/angled tool→rest→held shield→rest. “Locomotion” is the normal3m/s action path with renderer clip `walk`, not a separate sprint feature. The still body/feet and minimal hand/tool movement match the approved pixel contract. Three late “strike” samples had already returned to idle, so they are not claimed as additional strike poses.

| Criterion | Assessment and visible reason |
|---|---|
| Silhouette/proportion | **Usable draft:** the same squat blue/cream body, natural face and tiny feet persist across the sequence. |
| Form/construction | **Usable draft:** upright and angled handles remain attached to the holding hand; shield replaces the held tool without a second visible weapon. |
| Material/pixel craft | **Usable draft:** coherent blue/gold/wood/steel cell groups remain readable; no added contour ring or stretched action body is visible. |
| Cohesion | **Usable draft:** actor/tool cell scale and muted palette remain coherent against the voxel terrain at game scale. |
| Integration | **Usable draft:** world position changes during locomotion and stays fixed during strike/block/rest; no floating or body deformation observed. Foreground grass partly overlaps the tiny feet. |

Limits: one flat-ground facing in this sequence; earlier mirror/door/terrace captures remain separate evidence. Not every tool, enemy, hit/defeat, reduced-motion state or physical-device playback was sampled. This is bounded playback acceptance as a usable vertical-slice draft, not user approval of final art.

## 5. Validation and release

| Required scenario/gate | Evidence/limit |
|---|---|
| Preserve playable release until replacement passes; compatibility/migrations/reward replay | Fresh-start exception supersedes migration. Current7 roundtrip, old-key preservation and old-file rejection are tested; old chapters remain on explicit legacy route. |
| Continuous/no snapping/no duplicate movement; per-press/guard/boundary | Action/worker/input tests and actual route checks; current controller-specific Y/RT/LT proof passes. |
| Complete peaceful/mixed journeys; early payment/long sessions/missed days/delayed builds | Two fresh bounded reference simulations use real input frames/path travel/commands and paused offline work without fixture grants; early/late stage and clock tests supplement them. **Weak:** no uninterrupted human/UI hour-long balance playtest. |
| Terrain near stairs/doors/objects/occupied footprints | World safety/reachability/geometry tests, player-overlap placement/forge regression and local native terrain/rotated-door cases. Integrated UI rejection-path coverage is partial. |
| No duplicate payments/deliveries/gifts/build rewards/items; repeated grave/reload; correct idempotent offline work | Transaction/failure/quantity/clock tests; actual bank/save/import/grave/reload tests. |
| Keyboard/gamepad/touch in portrait/landscape | Emulator/touch cases in both viewports plus current Weapon/Settings proof pass; physical phone/controller remains untested. |
| Unit/strict types/build/native/baked/dist; lightweight release vs local visual suite | Lead reports692 units/82 files and strict build/native/baked/dist gates. Current10 functional GPU and exactly2 non-GPU release cases pass. |
| Approved voxel/pixel art; zero-cost/offline; static GitHub Pages | Native/pixel audits, release/PWA offline checks with WebGL disabled, real local/public WebGL proof; no required external requests recorded. |
| Actual public paths/PWA scope/cached upgrades/new saved progress/offline/WebGL after publish | `docs/release/valley-public.json` records old-cache replacement, fresh format7, untouched old keys, real public scope and offline WebGL for prior cache141aac213cf0. New audit fixes have no public verification yet. |
| Report measured performance and actual allowance without extrapolation | `docs/performance/valley/{README.md,metrics.json}`: small local DOM-pose latency proxies, not physical-device/frame-rate guarantees. Last progress note records30% used/~70% remaining; lead must refresh actual allowance at final handoff. |

Decision: listed implementation acceptance requirements now have local code/test/art evidence, including earned peaceful/mixed reference journeys and the previously missing controller/content routes. The final public artifact/upgrade verification remains with the lead before claiming this audit build live. Human pacing/physical-device playtests and unsampled animation/tool cases remain honest follow-up limits, not a demand for three wall-clock days.
