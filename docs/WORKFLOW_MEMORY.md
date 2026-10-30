# Working notes

> Current renderer update — 2026-10-30: Rendering: voxel/pixel is the sole default at the plain URL; no renderer switch or character-study query paths. Release-art prunes retired runtime assets; world-assets.json drives current offline downloads. Keep original source studies.

- Foliage: native-grid centres/90° turns. Body/tool use root depth; plants need per-column ground support depth +2-unit raster offset. Whole-clump root depth clips bases. Ground-contact GPU test includes opaque terrain, wind and far cameras. See FOLIAGE_RENDERING.md.

- Sky: procedural far-depth background + animated cloud layer captured bywater. Atmosphere controls enabled/coverage/speed/size; speed0/reducedmotion freezesphase. Camera ray math must ignore oblique clip's third row. Three noise taps/16KiB localtexture, no cubemaprebuild/network; no worldcloudshadows/GI update. See SKY_RENDERING.md.

- Water: shared planar capture (full render resolution + every-frame default; optional256–4096caps/60/30/15/4Hz), world-space ripples/sun specular and cached shore color; Visual settings→Water controls/copies it. Old512cap looked soft; old4/15Hz auto policy lagged. Count reflection in frame GPU/draw totals; last-capture CPU is separate. SSR/refraction are not implemented. See WATER_RENDERING.md. Ground joins now3native cells/0.1875m, palette samples only.

- Ground nowlivefromnativeVOX v3; see TERRAIN_RENDERING.md. Compactnearest atlas5mips, cachedchunks/phasecells,quietpresentationaldirtcleanup,8pigmentcells/m in16nativegrid/48colors. Cache delivery MUSTversionbothmanifest+pack usinggeneratedterrain-version.ts; user'snewcodeoncegotoldPWAart. Perf: userlive112FPS/4KSmooth;118hostA/B,notproofinitial12cause. Copy performance includesCPU/GPU/cache/resolution; preservelogicalterrain/nav/saves.

- Pixel cast review: fable-pixel-characters skill installed. Measure actual reference blocks/offsets before native tracing; guessed9×9/10×10prototypes were rejected. LatestAlden uses measured20×18finechart, separate hand/tool atsamepitch, staticbody/feet, tinyhand-onlygesture, truecameraquaternion billboards +horizontalmirror. STOPatrequestedAldenreview; restcastdraft. See PIXEL_CAST.md.

- Camera drags: anchor the grabbed world point; never combine per-event deltas with a last-rendered camera. Regression: batched events + direction reversal, both renderers/camera modes and phone orientations.

- Historical voxel-volume character sources: use fable-voxel-reference, one transparent three-quarter neutral pose, physical brief/shared pitch, clear limb gaps and short cape; inspect alpha on light/dark. Alden source candidate: assets/explorations/voxel/alden-source-v1/. Image only; no mesh/animation acceptance.

- Rendering: normal display resolution only, DPR capped2× with AA; Pixelated mode/selector removed. Ignore old render-style storage/presets. Keep sprite/voxel art and CSS-pixel picking; copied diagnostics retain renderStyle:smooth.

- Historical voxel actor update (superseded by pixel cast): simplify to coarse true cubic voxels, broad color masses, minimal faces/hair/clothes. Mostly authored frame-by-frame voxel poses plus restrained squash/stretch tweening; keep cubic cells and foot/tool anchors. Actual VOX idle/walk/work playback must be reviewed; concept pose sheets are not working animation.

- Current art direction (2026-10-30): warm storybook voxel fantasy for the entire cast/world. Read ART_DIRECTION.md first; user terrain reference saved as assets/reference/fable_crown_voxel_current.png. Painterly/ink character studies below are history, not current targets. Character voxel designs/animation remain pending; keep actual migration status explicit.

- Terrain style A: actual source kit assets/source/voxel/terrain-style-a-v2 (288modules=18families×16phases), browser/Blender reviewed; v1 brightgrass corrected viaimagegen to calmerolive. Warm softjoins,flat1m tops/.5m terraces/4treads. Keep4×4phase order mod(-z,4)*4+mod(x,4); do not randomly shuffle. SourcePNGs/prompts/VOX/editableBlend retained; sourceoverwriteguard. Liveground/fullautotiling/water/height-nav stillpending. See terrain-style-a-v2 README/review.

- Ground direction: nativeVOX authored tilemap, exact flat1m tops, proposed0.5m block terraces/vertical risers, separate4×0.125m stairs, level pads and shared prop/actor ground sample. No smooth noise/warped tile corners. See TERRAIN_ELEVATION_PLAN and VOXEL_ASSET_MIGRATION.10sourceprototype tiles in assets/source/voxel/terrain-kit-v1; check-kit.mjs --write imports edits without overwriting VOX. Not game-integrated/final art yet.

- Visual defaults: user's dusk preset, sun23.3°/62.3°, shadows2048/softness3.5/coverage79, GI1.3; AO distance0.125m (slider steps0.125m). Settings panel copies JSON; transport/AO distance updates rebuild the worker cache asynchronously.

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
- Voxel streaming: 16m parents contain 8m children; 5 LODs, 100k visible/262144 resident-cell targets. Use scripts/benchmark-voxel-lod.mjs; serialize builds/browser runs. GPU batches stream; shared VOX stays loaded. Gameplay caps at 64 vertical/96 horizontal tiles; strategic overview is separate.

- Release gate unfinished31Oct: acfa1dd on main; managed voxel-default-release worktree owns latest fixes. CI41142685175 has a saved-state observation failure; do not call voxel live. Resume from PROGRESS release checkpoint, then verify fresh/offline and cached upgrade.

- User authorized a temporary skip of only the healing/combat-style saved-row browser case31Oct; keep other gates and restore it after diagnosis.
