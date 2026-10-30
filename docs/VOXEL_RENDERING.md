# Voxel runtime and migration

> Current renderer update — 2026-10-30: Voxel rendering is now the default and only gameplay view, with the approved pixel billboard cast. Retired painterly/ink/fitted styles are excluded from the release. Display resolution uses antialiasing/DPR capped at 2×; historical Pixelated/Smooth controls below are retired. Environment conversion remains incomplete.

Current user direction (2026-10-30): replace the existing3D presentation's assets with the accepted voxel style. Keep native VOX as source data, render GPU-instanced cubes, partition the world into buckets and derive LOD. A first cached diffuse GI/AO pass and live FPS indicator are now implemented; see VOXEL_LIGHTING.md for evidence and limits.

## Implemented first replacement

All240trees in the default world now load the accepted oak from `public/art3d/voxel/tree.vox`. Existing actors/buildings/other props retain their current assets pending migration. The native source is byte-identical to the accepted [oak export](../assets/explorations/voxel/trellis-oak-softlight-v1/vox-01/asset.vox); no runtime TRELLIS or paid service.

- One world unit/metre per tile; native pitch0.0625m, pivot[34,35,0], height4m. A0.5m cut derives the harvested state from the same source.
- Native VOX150 parser supports one model and explicit RGBA; rejects malformed lengths/cells/duplicates and unsafe paths.
- Five cached asset resolutions: base pitch,2x,4x,8x,16x. Tiny models/stumps stop coarsening before their entire height expands. Majority material per coarse cell; any occupied child preserves thin features. Pivot is scaled consistently; no per-axis stretching. A final coarse cell may extend less than one coarse pitch beyond a non-divisible source bound; LOD is a visual approximation, not collision geometry.
- Fully enclosed cubes are omitted. Surface cubes still use ordinary cube faces; internal faces between neighboring surface cubes are not removed. Instancing reduces object/draw overhead, not all triangle work.
-16x16-tile parent sectors contain8x8-tile child buckets. Nearby sectors cull/render children independently; distant sectors combine their objects into one coarse draw. Split hysteresis avoids repeated transitions. Parent and children never render together. No scene node per voxel.
- Screen-size LOD works in perspective/orthographic cameras, with hysteresis. A100,000-cell visible-view target coarsens the least screen-significant buckets first, in addition to the50,000-cell local target. Saturation is reported instead of hiding objects. These are tuning budgets, not a universal frame-rate guarantee.
- Hierarchical frustum culling; GPU buffers allocate only when visible and upload on LOD/availability changes. Oversized buffers shrink on coarse transitions. World-object placement is static; changed world structure rebuilds buckets.
- Opaque colors are converted from palette sRGB to linear. Direct game lighting remains active. Distant/coarse voxel buckets do not cast sun shadows.
- Inactive GPU cache targets48batches and262,144allocated cells (about25MiB of matrix/color/AO attributes). Evict inactive parents/children first; active batches remain visible. Shared VOX source/derived levels stay in CPU memory; this is GPU batch streaming, not network asset streaming. Uploads remain synchronous at transitions.
- Gameplay zoom clamps to0.375–2: at most64tiles vertically and96horizontally (60vertical at1280x800), about182m maximum perspective rig distance. Buttons, wheel, pinch and keyboard share limits; rendering clamps incoming values too. Full-world orthographic overview is a separate strategic map using the coarser LOD budget.
- VOX files/manifest are included in Pages-base and offline-cache checks. Source geometry and game simulation remain independent.

Code: [data and LOD](../src/render/three/voxel-data.ts), [bucket instancing](../src/render/three/voxel-buckets.ts), [asset loading](../src/render/three/voxel-assets.ts), [source manifest](../public/art3d/voxel/manifest.json). Current implementation uses Three.js instance matrices plus colors. Compact position/scale/palette attributes and incremental buffer ranges are further options if profiling shows upload/memory costs; they are not implemented yet.

## Evidence

Latest LOD/streaming measurements and checks: [voxel-lod-v1](art-audit/voxel-lod-v1/README.md). The initial evidence below predates this optimization.

Visual settings → Visual style switches between **Pixelated** (legacy1200×800 maximum buffer, nearest-neighbor scaling) and **Smooth** (CSS viewport × device density, capped at2×, normal scaling). Native WebGL antialiasing is enabled at context creation so switching does not rebuild the world. Geometry, voxel LOD policy and gameplay remain unchanged; render density is independent of character art style. The selected style persists locally, is included in Copy settings, and resets to Pixelated. Higher-density rendering needs device-specific performance testing.

Current integrated suite:310unit tests and15browser checks pass, including native VOX, actual WebGL drawing, overview LOD, harvested stumps, GI/AO/FPS, character shader variants, phone viewport, saved gameplay and offline reload under `/Fable-Crown/`. Production build/typecheck/dist checks pass; existing large-chunk warning remains.

Actual [close view](art-audit/voxel-runtime-v1/world-close.png), [overview](art-audit/voxel-runtime-v1/world-overview.png), [phone viewport](art-audit/voxel-runtime-v1/world-phone.png), [stumps](art-audit/voxel-runtime-v1/world-stumps.png) and [browser measurements](art-audit/voxel-runtime-v1/browser-review.json). The asset workbench also uses instanced cubes.

Observed on Windows HeadlessChrome156/ANGLE Direct3D11, RTX5070Ti,45requestAnimationFrame samples per view, sun shadows disabled. Typical sampled frame intervals were8–17ms; read the JSON for counters and per-view values. These are host-browser observations with the rest of the game running, not isolated GPU timings, baseline speedup or physical-phone performance. Several million submitted triangles remain; instancing does not establish that this will be fast on low-end devices.

## Remaining asset migration

The first flat-ground integration is now implemented; [TERRAIN_RENDERING.md](TERRAIN_RENDERING.md) records nativeVOX source/nearest sampling,compact atlas,offline cache/version handling and current measurements. V3corrects fine/mottled pigment toward a coarser,quieter A interpretation. Actual block elevations and remaining prop/building/actor migration are still pending. Earlier standalone-ground status paragraphs below describe the preceding art gate.

Selected terrain style A now has288native source modules (18families×16phases) in `assets/source/voxel/terrain-style-a-v2/`, with an [actual patch review](art-audit/terrain-style-a-v2/review.md). The standalone preview derives greedy exposed surfaces and instances tiles; this does not change the live game's flat terrain renderer. First cosmetic ground binding,full autotile resolution and shared height/navigation integration remain to implement.

The detailed current inventory and replacement sequence are in [VOXEL_ASSET_MIGRATION.md](VOXEL_ASSET_MIGRATION.md). New ground direction: artistic nativeVOX tile modules and flat block terraces, proposed0.5m levels with separate stairs and exact level prop attachment; see [elevation plan](TERRAIN_ELEVATION_PLAN.md). Ten editable source modules and isolated browser/Blender reviews exist in `assets/source/voxel/terrain-kit-v1/` and `docs/art-audit/voxel-terrain-v1/`; gameplay ground remains unchanged while shared grounding/navigation integration is planned.

| Group | Current inventory / required work |
| --- | --- |
| Vegetation |240trees replaced. Add species variants and review crown overhang/density; current wider crowns overlap more than old trees. |
| Resources and props |30rocks,15decor groups,3anvils,3ranges,9fishing spots,1target,11clues; generate subject-specific voxel assets with matching scale/states. Include crate/barrel/lantern/tool variants. |
| Structures |3banks,3furnaces,5shops,8other buildings; preserve roofs/facades, entrances, walkable interiors and light sockets. Do not treat monolithic generated volumes as completed cutaway buildings. |
| Infrastructure |2bridges,54fences,3gates,8signs,2ferries,15landmarks; preserve orientation, deck heights and gate animation. |
| Characters/enemies |Retain animation until voxel parts have correct pivots/attachments or a tested rig. Static image-to-VOX does not supply walking/work animation.6quest objects also use character art. |

These counts come from the browser fixture's current world, not a list of distinct meshes to generate one-for-one. Reuse templates/variants and independent modules. Tree is the current native-VOX binding; extend runtime object/state bindings when each new category is ready. Full replacement is still in progress; no deployment performed.

## GI, AO and live performance

[Current implementation and measured limits](VOXEL_LIGHTING.md): worker-traced first-bounce diffuse transport, visibility-aware world cache, separate voxel corner/world AO, independent controls and rolling FPS/frame time. Terrain, ordinary meshes, characters and instanced voxels receive the field. It is a desktop-tested prototype; actual-mobile performance, finer dynamic contact occlusion and remaining asset replacement are pending. No full-screen GI pass or GTAO is used.
