# Working notes

- Floating UI: no plates on health/work/name/reward/combat labels; halo for text. Nine-pixel health vials use FloatingVials (sun/fill +4existing lamps,10Hz, cached CSS writes); rounded front glint follows light angle/tint. Skilling uses ActionCycle SVG rings in world/HUD; world arc follows actual interpolated attempt fraction and resets at the next attempt. Keep liquid readability floor; no backdrop blur/captures. Review rpg-floating-ui and actual day/night/action screenshots.

- Mobile UI: `mobile-hud.css` covers ≤760px or ≤500px height. Default HUD stays under25% coverage; Tools reveals map/camera/visuals, Thoughts holds details. Run rpg-mobile-hud + visual-settings + mobile three/messages checks locally; keep GPU coverage out of release CI.

- LOD: select per object inside shared batches, using camera depth/scaled pitch. Use floor for the 1.5 CSS-pixel target; keep desired hysteresis separate from forced budgets. Cull exact object bounds before spending detail; the old 100k view cap masked the threshold fix. Current caps: 250k visible/100k per batch/524288 resident. Regressions: voxel-rendering.test.ts + rpg-voxel-lod.spec.ts (native trees, zoom return/mobile/offline).

- First prop batch: assets/explorations/voxel/prop-batch-v1. Image→TRELLIS→vox-01 raw; vox-02 explicit palette ramp pass fixes near-black faces without geometry changes. Shared16cells/m +4m oak comparisons. Ore inferred1.625×1.75×.75m,larger thanbrief; crate brace weak. Review beforebinding; ore states/material variants pending. run_prop_batch.py --resume preserves complete jobs; converter now takes --asset-id. Current drafts+scale ZIP inbatchfolder.

- Daylight shadows: never texel-snap the target in a rotating light basis; it introduces stationary-camera jumps. Cycle follows continuously; fixed presets retain snapping. GPU comparison: rpg-daylight-shadows.spec.ts.

- Lens distortion: Visual settings → Lens & world, default0.15×, 0=off; persists locally/copies/resets. Composite warp and CPU picking/label inverse share lens-distortion.ts; overview stays unwarped.

- Starting camera follows Alden at MAX_GAMEPLAY_ZOOM (2×), the closest allowed view.

- Lens defaults: world curvature2×, depth of field0.25× (2026-10-31); shared defaults also drive Reset.

- Curved-view horizon: ViewDistance uses unbent world coordinates for fog, terrain/voxel culling and clicks. Fog fades before the cutoff (24m at closest zoom); nearly opaque targets cannot be selected. Keep drag anchors unrestricted and overview exempt. GPU fragment clipping also covers shared batches/reflections.

- Menus/inspectors: keep the visible world drawing every foreground RAF. The old panel-open cap forced4FPS. Benchmark actual WebGL draws against RAF; use tests/rpg-panel-performance.spec.ts and docs/performance/menu-panels.

- Lens: subtle bloom/edge chromatic aberration; stronger distant DoF uses a 32-sample circular HDR bokeh gather, broad sharp focus and gentle foreground blur. Visual settings → Lens & world. Close zoom lowers pitch 5° and adds cylindrical vertex curvature. Keep picking, pivot depth, culling and inverse-bent water UVs aligned. HDR + fused FXAA avoids multisampled HDR buffers; UI stays outside the pass.

> Current renderer update — 2026-10-30: Rendering: voxel/pixel is the sole default at the plain URL; no renderer switch or character-study query paths. Release-art prunes retired runtime assets; world-assets.json drives current offline downloads. Keep original source studies.

- Foliage: layered mats→short fringe→grass→shrubs; separate flower patches. Sample native ground pigment per card; blend face/up normals. No dark root bars. Halo-filter coplanar overlaps; mats abut by tile. Keep pixel pitch, grid roots and support depth. See FOLIAGE_RENDERING.md.

- Grass tips: restrained palette +85%card tint at tips. Four atlas blade patterns chosen by world cell; subtle color variance. Keep pattern stable across camera moves and avoid extra instance buffers.

- Sky: procedural far-depth background + animated cloud layer captured bywater. Atmosphere controls enabled/coverage/speed/size; speed0/reducedmotion freezesphase. Camera ray math must ignore oblique clip's third row. Three noise taps/16KiB localtexture, no cubemaprebuild/network; no worldcloudshadows/GI update. See SKY_RENDERING.md.

- Water: full-resolution/every-frame reflection; clear basin→opaque blue. User rejected contour rims AND smoky warped-noise foam. Use small stable flecks drifting downstream, with gradual lifetimes; distance only fades them at banks. Review animation, not just stills; GPU tracking must improve after correcting for current displacement. See rpg-water-depth.spec.ts/WATER_RENDERING.md; preserve surface depth and0.1m bank lip.

- Ground nowlivefromnativeVOX v3; see TERRAIN_RENDERING.md. Compactnearest atlas5mips, cachedchunks/phasecells,quietpresentationaldirtcleanup,8pigmentcells/m in16nativegrid/48colors. Cache delivery MUSTversionbothmanifest+pack usinggeneratedterrain-version.ts; user'snewcodeoncegotoldPWAart. Perf: userlive112FPS/4KSmooth;118hostA/B,notproofinitial12cause. Copy performance includesCPU/GPU/cache/resolution; preservelogicalterrain/nav/saves.

- Pixel cast review: fable-pixel-characters skill installed. Measure actual reference blocks/offsets before native tracing; guessed9×9/10×10prototypes were rejected. LatestAlden uses measured20×18finechart, separate hand/tool atsamepitch, staticbody/feet, tinyhand-onlygesture, truecameraquaternion billboards +horizontalmirror. STOPatrequestedAldenreview; restcastdraft. See PIXEL_CAST.md.

- Camera drags: anchor the grabbed world point; never combine per-event deltas with a last-rendered camera. Regression: batched events + direction reversal, both renderers/camera modes and phone orientations.

- Historical voxel-volume character sources: use fable-voxel-reference, one transparent three-quarter neutral pose, physical brief/shared pitch, clear limb gaps and short cape; inspect alpha on light/dark. Alden source candidate: assets/explorations/voxel/alden-source-v1/. Image only; no mesh/animation acceptance.

- Rendering: normal display resolution only, DPR capped2× with AA; Pixelated mode/selector removed. Ignore old render-style storage/presets. Keep sprite/voxel art and CSS-pixel picking; copied diagnostics retain renderStyle:smooth.

- Historical voxel actor update (superseded by pixel cast): simplify to coarse true cubic voxels, broad color masses, minimal faces/hair/clothes. Mostly authored frame-by-frame voxel poses plus restrained squash/stretch tweening; keep cubic cells and foot/tool anchors. Actual VOX idle/walk/work playback must be reviewed; concept pose sheets are not working animation.

- Current art direction (2026-10-30): warm storybook voxel fantasy for the entire cast/world. Read ART_DIRECTION.md first; user terrain reference saved as assets/reference/fable_crown_voxel_current.png. Painterly/ink character studies below are history, not current targets. Character voxel designs/animation remain pending; keep actual migration status explicit.

- Terrain style A: actual source kit assets/source/voxel/terrain-style-a-v2 (288modules=18families×16phases), browser/Blender reviewed; v1 brightgrass corrected viaimagegen to calmerolive. Warm softjoins,flat1m tops/.5m terraces/4treads. Keep4×4phase order mod(-z,4)*4+mod(x,4); do not randomly shuffle. SourcePNGs/prompts/VOX/editableBlend retained; sourceoverwriteguard. Liveground/fullautotiling/water/height-nav stillpending. See terrain-style-a-v2 README/review.

- Ground direction: nativeVOX authored tilemap, exact flat1m tops, proposed0.5m block terraces/vertical risers, separate4×0.125m stairs, level pads and shared prop/actor ground sample. No smooth noise/warped tile corners. See TERRAIN_ELEVATION_PLAN and VOXEL_ASSET_MIGRATION.10sourceprototype tiles in assets/source/voxel/terrain-kit-v1; check-kit.mjs --write imports edits without overwriting VOX. Not game-integrated/final art yet.

- Visual defaults: user's dusk preset, sun23.3°/62.3°, shadows2048/softness3.5/coverage79, GI1.3; AO strength10%, distance0.125m (slider steps0.125m). Settings panel copies JSON; transport/AO distance updates rebuild the worker cache asynchronously.

- Voxel: VOXEL_PIPELINE/RENDERING/LIGHTING.md.240trees use native VOX, instanced cubes,16tile buckets/3LODs. First-bounce worker GI + separate corner/world AO + live FPS now implemented; other art pending. Coalesce resource changes behind active solve to avoid starvation; capture gates after transforms. Keep diffuse RGB separate. RTX5070Ti results are not phone benchmarks; no deployment.

- Instant Meshes parameter gate FAILED on corrected input: denser20k/43k quads stilladdtunic/capeholes. Tested no-b, smooth0, intrinsic, crease60 andquad-dominant; nonefixes. Inputtopologyhasnoduplicates/zero-area/nonmanifoldedges; pinholesmax1.4cm vsoutputgaps18–41cm. Don'tblamesourceshapeorblindweld. See art-audit/instant-mask-fixed-v1/review.md; useguidedpartretopo beforeweights.

- Segmented remesh V2: outer boot cuffs reassigned correctly for test; 43,021 quads reassembled at original coordinates, unwelded/unrigged. Tunic/cape tears persist; not accepted. Continuous cuts need connected loops; garment shells need hidden overlap. Object join is not repair. See art-audit/segmented-remesh-v2/review.md.
- Corrected generation baseline: alden-triposg-highpoly-v3-mask-fixed.blend. Old mask filled18,186 paper pixels between boots; explicit alden-front-mask-v2 fixes negative space without redrawing RGB. Same-seed rerun has no inter-foot plate; user confirms gap sorted. Check alpha on coloured background BEFORE inference; do not blanket-fill holes. See art-audit/triposg-mask-fixed-v3/review.md.

- Retopo correction: large cape holes/fragmentation were introduced downstream, not justified by source defects. Untouched high-poly verified against raw arrays; matched-camera views in art-audit/triposg-untouched-highpoly. Preserve this baseline. Instant Meshes test failed shape preservation; RF4.2.0 registered but guided strokes not yet used. See RETOPOLOGY_TOOLS.md.

- Historical non-voxel character route: local TripoSG → corrected body cages → RGB bake → rig/GLB. Saved alden-triposg-painted-v1.blend; 18,183-triangle candidate technically/browser verified, experimental only. Static head is reduced triangles (QuadriFlow failed), not facial retopology. Stray sheets/projection marks remain. Public fixture unchanged. See CHARACTER_GENERATION.md.
- Reconstruction gotchas: reject opposite-hemisphere ray hits; infer hidden body under cloak. Check actual outward normals before baking (two-sided render hides flips). Use one UV-layer name before joining; repack after shape edits. Reference projections can print limbs onto cloth; inspect side/back, not only front.
- Topology inspection: neutral source-edge renders in art-audit/triposg-topology-inspection. Current draft has18 non-manifold head edges and1 degenerate belt face; body quad bands do not establish clean shoulder/hip connections. Still placeholder topology despite valid GLB.

- Reconstruction study: CHARACTER_RECONSTRUCTION_STUDY.md. No-neural route needs reviewed facial cage + matching landmarks/feature curves; separate bare head/hair. Minimum test front/profile/held-out¾; preferred6views+optionaltop. Drawings ≠ stereo photos; rendered draft depth adds no target evidence. Solver not implemented.

- Sculpt test REJECTED: tools/sculpt-lab (localhost8766); manual outer contours → hull/rounded rows → triangles; RGB interior unused, maps rendered afterward. Ridged envelope has no likeness/face/hair structure. Closed edges/IoU do not establish art quality. See local-sculpt-v1/review.md; do not add detail to this mesh.

- Tripo research: learned image→3D priors, not a sculpt recipe I can absorb. Local TripoSG now installed/tested; isolated character input required. Research notes in CHARACTER_MODELING_WORKFLOW.md; current status in CHARACTER_GENERATION.md.

- Current clay review: assets/source/3d/alden-sculpt-v2.blend; actual views/comparison in docs/art-audit/alden-sculpt-v2/. Packed generated turnaround under assets/reference/character-style/turnaround/; original v4 stays authoritative. Still placeholder; stop at review before more detail/retopology.

- Character production: sculpt-first, approve form, retopologize, test bends early, UV/bake/paint, rig/animate and validate export. Density follows silhouette/deformation/screen size; no universal poly budget. See CHARACTER_MODELING_WORKFLOW.md and actual topology-audit.json.

- Historical ink character workflow: establish style before skill/batch modeling. User wants compact proportions with fine ink/watercolor; latest concept alden-compact-ink-3d-v4 in assets/reference/character-style/. Blender reproduction/style acceptance pending.
- Modeling review: show actual Blender solid + source wireframe in small stages; get user feedback before advancing proportions → connected topology → deformation → ink materials. Current scripted ink blockout is not accepted as usable character topology.
- Proportion correction: compact ink concept remains lean/expressive; avoid squat oversized-head doll, capsule sleeves, tube boots and helmet hair. Match concept silhouette first; user rejected current blockout proportions.

- Historical optional3D test (existing runtime behavior): chunky RuneScape-inspired forms, pixel textures, JRPG characters, muted colours and atmospheric realtime lighting. Four shadowless local light slots plus one sun shadow; keep painterly default. User wants lead-owned design/integration and bounded specialist delegation. See THREE_RENDERER_TEST.md.
- 3D art: use skills/fable-3d-art; one lead controls Blender MCP, modelers own separate recipes. Saved .blend → art:export → art:check → art:capture/workbench. Load a .blend and export in separate MCP requests so Blender restores context. Preserve draft checkpoints; image review is separate from technical passes.
- Gameplay scope: FEEL_AND_OAKREST.md; stop after verified Pages. Earlier painterly Town Life appearance is superseded by ART_DIRECTION.md; compare voxel replacements at gameplay scale.
- Pure tile simulation → worker clock/saves → isometric Canvas. Lead owns contracts/integration; specialists own separate files. Sol High core, Sol Medium renderer, Luna Medium browser QA.
- Gate each stage: unit tests, strict build, check:dist, browser. Serialize builds: another build can replace dist with a different base during browser tests.
- Pages: cudldev/Fable-Crown. Live 3D test uses `?renderer=3d`; viewer adds `&assetReview=1`. Build GITHUB_REPOSITORY=cudldev/Fable-Crown; Playwright DEMO_URL=http://127.0.0.1:4174/Fable-Crown/. Preview inherits base from URL. Verify actual public release after CI.
- Windows npm certificate fix: NODE_USE_SYSTEM_CA=1; retain TLS. Localhost/git/network may need sandbox escalation. No paid services or reset redemption.
- Current key v5 copies V4/V3; never overwrite archived v4/v3/v1. Real migration fixtures cover each prior chapter. Sources/prompts through assets/generated/v5; metadata merges across versions. Offline query reload uses cached index fallback.
- Zoom regression: visible terrain must fit cache or use the far composite; benchmark close/far/overview. Ore quantities aggregate in saves/bank but occupy separate backpack slots. Replay no historical reward floaters after import/offline resume.
- Bottom log includes prominent dialogue/quests/discoveries/level-ups/blockers; routine XP/items remain world feedback. Hide it behind active drawers; keep Thoughts reachable. Bound actor cache96cells, terrain cache24chunks; benchmark actual turning and far views before release.
- Planner clarity: actual Now/Why/Next and8-entry history, separate from prominent messages. Profile edits preserve current goal/queue/XP; explicit reconsider captures ranked top4. Preview draft traits separately from active choices. Default50 traits preserve quest chain; Caution changes autonomous food/retreat. Inventory orders resume autonomy, so combat-range fixtures must establish positions after gear preparation.

- Pixel cast: approved Alden measured17×18body, shared0.0625m native cell (unit-scale.ts); never resize tools/species separately. Full cast authorized2026-10-30.
- Autonomous pace lives in RPG travel, not rendering: reserve15%, restart40%, safe long-trip rest to60%; direct orders/manual pace override it. Cover save/offline replay and the real worker HUD.

- Latest local playtest: use production preview with the build's matching base (currently npm run preview -- --base /Fable-Crown/ --port 4173), then /Fable-Crown/?renderer=3d. Verify the visible voxel world/pixel cast; public Pages may lag local work.
- Voxel streaming: 16m parents contain 8m children; 5 LODs, 250k visible/524288 resident-cell targets. Use scripts/benchmark-voxel-lod.mjs; serialize builds/browser runs. GPU batches stream; shared VOX stays loaded. Gameplay caps at 32 vertical/48 horizontal tiles (zoom0.75–2), halved per user request; strategic overview is separate.

- Memory: measure production Chrome OS private bytes against blank-browser baseline; report resident working set separately. JS heap excludes workers/native/GPU. See art-audit/memory-v1; tmp/memory-audit.mjs reproduces. Do not present partial GPU trace counters as total VRAM.

- Memory optimization backlog: tasks/MEMORY_OPTIMIZATION.md. Source tree models already share1.56MB; prioritize expanded render attributes, then worker source sharing and measured allocation churn. No optimization implemented yet.

- Memory user constraint: preserve runtime speed/responsiveness. Benchmark indirection,packing,shared GI transforms and half-float writes; compare frame tails/hitches and GI latency without memory tracing. Keep current path if parity is unproven; prefer duplicate removal and bounded reuse first.

- Character lighting: no emission/self-lit color. Broad form normals in unit-normals.ts, scene sun/fill/lamps/GI only; Sprite depth0.85, zero=flat.

- Daylight defaults to Cycle (30active minutes/day, saved tick phase); fixed presets pause it. GI phase quantizes to0.5h; optional1/2/3bounces keep one atlas. Compare with rpg-fidelity.spec.ts after builds/tests finish, without parallel CPU work.

- Sky: shared fog gradient; discs may be offscreen. Rays now march low fog through the existing world shadow map, including rear-source/ortho views. Require fog+sun shadows; tests/rpg-fog-shafts.spec.ts covers GPU and actual forest views.
- Rays default0.65. Fog-edge checks: rpg-fog-edge.spec.ts; sky and fully fogged geometry must share shaft endpoints/depth classification and grading.
- Blue shore/fog outlines: reproduce river bridge via rpg-shore-outline.spec.ts. Shafts must defocus with scene color (rpg-fog-defocus.spec.ts); shoreline.ts closes the land0/water−0.055m gap. Keep0.65default.

- Voxel-only release is not live yet. Latest branch codex/voxel-default-release, managed worktree C:/Users/antto/.codex/worktrees/voxel-default-release/Fable Crown. See its PROGRESS checkpoint; CI save observation remains unresolved.

- UI concepts (2026-10-31): Field journal parchment / Crown blue navy; actual pixel portraits, compact Now/Why/Next and contextual thoughts. Conversation preview only; direction awaits user feedback.

- UI preference: user requested a stronger medieval theme; explore heraldic shields, wood/iron frames and parchment scrolls. Oak & iron / Illuminated court are unapproved previews, not runtime changes.

- UI correction: user dislikes gradients/cheap bevels. Keep medieval identity through flat parchment, woodcut lines, simple heraldry and matte colors; avoid simulated glossy materials. Current flat previews remain unapproved.

- Native props: publish reviewed batch with tools/trellis-vox/publish_prop_batch.py; check-voxel-assets.mjs --write updates cache version. Bind kind/art/resourceId in voxel-assets.ts, explicit depleted VOX in manifest. Keep pitch/pivot; compose supplies once. Test real world + local GI depletion/respawn + stale-cache offline reload (rpg-voxel-props.spec.ts). GI depletion counter is local, not total-world count.

- Gameplay feel: direct world orders persist manual mode (control.autoplay=false); inventory preserves it, explicit goals finish once. WASD/tile taps; explicit toggle resumes autonomy. Test rpg-gameplay-feel.spec.ts + rpg-manual-control.test.ts. World status labels avoid each other; combat numbers move freely below status/HUD; HUD ResizeObserver supplies --dock-height. Work labels reflect actual actions, not ambitions; never replay imported effects.

- World inputs: primary click/tap uses default-interaction.ts; secondary click/500ms hold opens WorldContextMenu, More options retains detailed panels. Escape issues cancel (queue+targeting+movement, manual hold). Default NPC talk has once:true; no implicit quest pursuit. Damage floaters bind targetId to victim body; pop/rise/fade, reduced-motion fallback. Tests: rpg-inputs.spec.ts; sample short-lived damage atomically.

- Click feedback: primary clicks/taps/keyboard show a brief screen-position X (enemy red, otherwise yellow); no drag/pinch/context marker. Effects layer is isolated below status/HUD, never catches input. Damage bypasses collision layout and drifts from victim; XP/items avoid status bars. Combat has no redundant overhead work card. Regression: rpg-click-feedback.spec.ts.

- Combined release: tmp/release-publication on codex/live-update-20261031 integrates finished chats with prior release fixes. Live status follows the latest PROGRESS entry. Preserve authoring workspace; transient quest/arrival assertions observe worker snapshots, then separately verify persisted outcomes.

- Test boundary: npm run test:visual is local art/GPU/performance review; npm run test:release is bounded core/PWA CI. Full test:browser remains local. Keep new visual cases out of deployment.

- Final CI boundary: test:release has2non-GPU worker/save/offline/mobile smoke cases. GPU interactions and visual/performance suites are local; verify real public WebGL after publish.

- Current live release3145104 / Actions41156022977 verified2026-10-31; e9d6b83674ae. Canonical integrated checkout tmp/release-publication. CI2non-GPU smoke cases; visual/GPU suites local. Wait for SW activation before upgrade reload; hold save fixtures via real Pause/Save.

- Async rendering: voxel assets decode in a worker; runtime LOD stages at2ms/8192cells and commits≤1replacement/frame, retaining prior/coarse coverage. GI slices at~4ms; final GPU uploads remain synchronous. Keep identical capped levels shared.
- Streaming benchmark: scripts/benchmark-streaming.mjs LABEL; BENCH_DIST selects an isolated original. Run original→changed→original serially; see performance/async-streaming. Root pass is not yet in tmp/release-publication. New local GPU regression: rpg-voxel-streaming.spec.ts; mobile controls use Tools.
- First overview hitch diagnosed: shader-profile.json records934ms frame/~880ms waiting on11new shader programs. No async prewarm currently; warm normal+overview fog/shadow variants next. See performance/async-streaming/README.md; diagnosis only.
- Startup now gates all HUD/world input through ScenePreparation; initial HTML also explains loading. Precompile actual direct/HDR/overview/post targets before ready; abort context loss, require current GI version. New rpg-startup tests cover offline/error/noHUDflash and0first-overview links.
- Combined candidate is now integrated in tmp/release-publication, including latest glass-vial/action-ring UI. Publish only after other project chats finish; local visual coverage77active/1priorwaiver, release CI stays2non-GPU smoke cases.
