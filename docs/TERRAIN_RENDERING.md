# Native VOX ground in the3D game

The default3D renderer now binds the selected warm-storybook A ground art from `assets/source/voxel/terrain-style-a-v3/`. This is the cosmetic flat-ground stage of [the elevation plan](TERRAIN_ELEVATION_PLAN.md), not a terrain/navigation height change.

## Source and delivery

`scripts/publish-terrain.mjs` validates and concatenates the288unchanged editableVOXfiles into `public/art3d/terrain/tiles.bin` with a local manifest,byte ranges,scale,phase tables and source/integrity hashes. This avoids one network request per module. The binary is a delivery cache of exact native files; edit sourceVOX,refresh its manifest with `check-kit.mjs --write`,then republish. It is not the editing format.

The pack is2,625,792bytes before HTTP compression; manifest/pack are precached under the Pages repository scope. Prebuild and dist gates verify offsets,native support frames,opaque pigment,version hashes and cache paths. No source PNG,model,service or API is required at game runtime. A missing/invalid optional terrain cache produces a visible asset warning and usable fallback ground.

Publishing also generates `terrain-version.ts`. Both runtime URLs and PWA cache entries include `?v=<published-version>`,and the loader rejects mismatched metadata before loading the pack. This fixes the observed case where fresh renderer code received old artwork from an already active PWA cache. Sources and delivery remain local/static.

## Rendering and softness

The loader reads actual occupied cells/palette and validates the flat top/socket contract. Grass,dirt,paving(`stone`) and sand retain16native cells/metre. V3 uses coarser8pigment cells/metre (each color repeats over2×2native cells) and48opaque palette colors. Quiet earth replaces the earlier orange/green/pebble mottling. Water uses a separate reflective material at−0.055m; see [water rendering](WATER_RENDERING.md). Ordinary land remains exactly y=0; actor/prop roots,picking,collision and saves are unchanged.

Flat source tops are baked to an atlas and represented with two triangles per logical tile,grouped into32×32tile chunks. All dry materials share one atlas/material; water is separate. Buried slab cells and one cube per pigment pixel are unnecessary for this stage. Native color-cell boundaries use **nearest magnification**. Five explicit tile-isolated mip levels16→1 and1/64pixel guarded UVs reduce distant shimmer without leaking neighbouring atlas materials; no linear magnification or runtime blur is added. Direct byte copies and per-bake source-cell caches replace per-pixel array/view allocations. Unused native vertex colors and small per-tile point arrays were removed.

Only used material/topology/phase combinations enter the atlas. Preserve the4×4macro-artwork phase with positive modulo: `mod(-worldY,4)*4+mod(worldX,4)`. A deterministic neighbour resolver composes authored native edge/corner cells,including opposing edges and junctions. Cardinal earth/paving takes priority over cardinal shore,then diagonal earth,then diagonal shore. Grass beside paving uses an earth margin; sand/water use a sand margin. East/west/corner stamps rotate their pigment with the mask,so exact global pigment-phase continuity there remains a limitation. Three-material junctions use the declared priority rather than a new bespoke joint asset.

The latest seam pass compresses the source pigment ramp into three native cells (0.1875m). It selects existing palette cells without interpolating colors; interiors retain their original coordinates, exact edge endpoints remain, and corner joins occupy3×3cells. Native VOX files stay unchanged/editable. Distant mip averaging remains intentional; this pass removes broad material fades rather than all distance filtering.

The bake and chunk geometry are cached by static terrain-array identity/dimensions; movement,ticks,camera/lighting and collision-only world changes do not repaint/upload them. A real layout/road change can rebuild them. Isolated interior dirt speckles completely surrounded by grass receive grass artwork in a presentation-only copy; connected roads,plots and authoritative tiles stay intact. GI uses this presentation map and linear native material averages rather than an unrelated atlas-centre sample. Existing flat ground occupancy remains; raised columns/risers are future GI work.

## Validation and remaining work

Unit checks cover malformed source ranges/frames,actual source edits,phase/orientation selection,edge/corner crossings,all mip-level isolation and disposal. Actual game/offline/fallback/mobile captures and host observations are recorded in `art-audit/terrain-runtime-v1/` after browser verification. These are host-browser checks,not physical-phone speed guarantees.

The [optimization investigation](art-audit/terrain-optimization-v1/README.md) records a highly drifting initial legacy/native bracket and a later stable118FPSbracket,so it does not attribute the original120→12report solely to terrain. Atlas storage fell5,591,040→1,396,736bytes; observed bake532→47ms. A user-supplied live report subsequently showed112.4FPS with a3840×1941Smooth buffer and53msbake,but stale artwork. Frame-stage CPU counters and Visual settings→Copy performance now make such reports actionable; nothing is sent remotely.

Final browser verification also seeds stale unversioned manifest/pack entries into an isolated PWA cache before offline reload: the versioned current211...assets still load correctly. Five targeted camera/settings/performance-copy regressions pass in addition to both native-ground acceptance tests. The camera test now chooses an exposed scene point because its old fixed landscape point overlapped the moved preview toolbar; the drag algorithm was not changed by this fix.

Remaining: finer art/pattern repetition,orientation-aware pigment sockets,authored water/bank modules and true block elevations. Elevation requires shared support sampling,level pads,stairs,picking,GI and navigation edges before rollout; see the separate plan. Other props/buildings/actors remain in [the full migration](VOXEL_ASSET_MIGRATION.md).
