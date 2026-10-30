# Authored VOX ground tiles and block terraces

Latest user direction,2026-10-30: artistic tilemap ground authored as VOX, retaining a Minecraft-like feel with flat terraces and level attachment surfaces for props. This supersedes gentle terrain deformation. This is a plan; the world has not been resculpted.

The cosmetic flat-ground stage is now [integrated in the3D game](TERRAIN_RENDERING.md), using nativeVOX V3pigment and a compactnearest atlas. It includes a renderer-only cleanup of isolated decorative dirt speckles. Support/picking/navigation heights remain unchanged; the block-terrace stages below are still future implementation work.

## First prototype evidence

Ten original editable source modules now exist in [terrain-kit-v1](../assets/source/voxel/terrain-kit-v1/manifest.json): two grass interiors, dirt, cobbles, sand, three grass/dirt join studies, stone fill and four-tread stairs. [Authoring/check commands](../tools/voxel-terrain/README.md) preserve manual VOX edits; validation reads native cells, checks flat/stair support sockets and refreshes metadata without regenerating geometry. This prototype uses direct authored volumes, not TRELLIS reconstruction.

Actual [terrace patch](art-audit/voxel-terrain-v1/terrain-preview.png), [labeled modules](art-audit/voxel-terrain-v1/modules.png), [phone](art-audit/voxel-terrain-v1/terrain-phone.png) and [Blender native-source render](art-audit/voxel-terrain-v1/blender-modules.png) were inspected. Flat geometry/scale are usable drafts; recurring grass blobs, basic material work and incomplete neighbour rules remain placeholder art. The isolated browser uses greedy exposed surfaces and99instanced placements with no external requests/errors; it is not integrated into gameplay or a runtime benchmark. Four focused grid/mesher tests pass; actual MagicaVoxel opening remains unverified.

## Art and scale

The selected A look now has an actual [editable VOX kit](../assets/source/voxel/terrain-style-a-v2/README.md):18families×16phases,288modules,flat1m tops and0.5m stairs/terraces. The [assembled patch](art-audit/terrain-style-a-v2/terrain-preview.png), [unlit pigment](art-audit/terrain-style-a-v2/terrain-unlit.png), [modules](art-audit/terrain-style-a-v2/modules.png) and [review/limits](art-audit/terrain-style-a-v2/review.md) have been inspected in the browser and Blender. A focused generated-art correction made the grass calmer after the brighter first native pass. Ground artwork is a usable draft; actual world binding,full corner/junction rules,water and elevation/navigation integration remain next gates. Native-source fields wrap over4m; preserve phase ordering rather than randomizing tile variants.

Style exploration lives in [terrain-style-v1](../assets/explorations/voxel/terrain-style-v1/README.md). The user likes A and B and selects **A Warm storybook** for its softer transitions. Use the [style profile](../assets/explorations/voxel/terrain-style-v1/style-profile.json): warm olive/sage grass, ochre earth, pale stone and gentler pigment joins. Achieve soft transitions with interleaved square voxel color clusters and transition variants while preserving crisp vertical terraces and exactly flat support planes. The concept does not establish metric geometry or seamless tile rules. Raised grass/paver decorations remain separate from support tops.

One logical tile remains1m; base voxel pitch remains0.0625m. Build an authored, reusable ground kit with broad moss/grass masses, worn earth, selective pebbles, connected cobbles, sand and readable river edges. Avoid uniform speckle or independently randomized color noise. Keep quiet surfaces under actors and near services.

| First kit | Required shapes |
| --- | --- |
| Grass, dirt, stone, sand |3quiet interior variants per material; shared tile bounds and edge sockets |
| Grass↔dirt |Straight edge, outer corner, inner corner, narrow trail/end; rotations reuse art |
| Stone↔dirt and sand↔grass |Straight edge and both corners; town paving joins dirt paths |
| Water bank |Straight, inner/outer corner, shallow sand lip; water stays at a fixed connected level |
| Height transitions |Flat terrace tops and vertical earth/stone risers; corner/end caps; separate stair connector rising0.5m in four0.125m treads over1m |

Author the tiles as native MagicaVoxel-compatible VOX:1m=16×16horizontal cells at0.0625m pitch, with enough vertical cells for the slab/edge profile. Bake reusable hidden-face-removed surface geometry and LODs for runtime. This preserves VOX editing without requiring per-cube rendering for dense ground. A tilemap entry selects tile ID, rotation and elevation; keep walkability/building-pad metadata separate from visible colored cells.

Record edge profiles, top/support surface, base pivot, material transition and allowed rotations in a ground manifest. Tile modules are ground assets, not loose props. Their border cells/heights/palette must agree by construction; use common dimensions and shared edge strips. A final assembled3×3/5×5 patch, not individually fitted renders, is the art/seam gate. Walking surfaces need an explicit height contract independent of decorative grass tips.

## World composition

Author tile choices by neighbourhood: packed village paths, stone service yards, richer woodland margins, quarry gravel and sandy riverbanks. Use a deterministic neighbour mask to select transitions and coordinate-hashed interior variants; never consume gameplay RNG. Define a material priority rule for three-material junctions so two neighbours cannot choose incompatible edges. Rotate both geometry and edge metadata.

Start with the Oakrest village square, woodland path, quarry approach and one riverbank patch. Propose discrete0.5m elevation levels (8base voxels), configured explicitly in a world profile rather than assumed as a final accepted scale. Each ordinary tile has one exactly flat top; adjacent levels meet at a visible vertical riser. Initial outside terraces can use0,0.5and1m heights. No smooth noise, per-corner terrain warping or automatic sloped tiles. Use separately authored stairs at deliberate routes; optional connector ramps require explicit placement and are not the default ground shape.

Initially keep ground under existing buildings at0m. Every footprint, entrance tile, interaction tile, gate opening and adjacent delivery area shares that flat pad. Place connectors outside the working pad. Foundations/skirt modules conceal pad edges without burying doors. Large props require a single level across their support footprint; trees, rocks and posts snap their ground pivot to the shared tile top, not a separately guessed offset. Fence spans stay level or use an authored stepped module. Bridges need a declared level deck and flat approaches; match banks to the deck rather than independently raising each end. Pin connected water and ferry boarding points to the same authored water/deck levels. Do not cut existing routes with a new unconnected cliff.

## One shared surface contract

Add a pure static world-layout compiler, proposed `src/rpg/ground-layout.ts`, shared with presentation and worker navigation. Key cached output by immutable world/layout revision. Each tile stores art ID, rotation, integer elevation level and optional stair/deck type. The explicit profile maps one level to0.5m initially. Separate support, edge-connection, build-pad and walkability metadata from colored cells. Keep stairs' tread height0.125m=2base voxels; no saved per-actor render height is needed.

Expose `sampleGroundSurface(x,z)` returning height, normal and surface kind, plus `groundPadHeight(object)`. An ordinary tile always returns its exact constant top height. A stair returns the actual authored tread profile; its direction/end levels must match the neighbour connection metadata. Do not bilinearly interpolate across a vertical terrace edge. Quiet grass/cobble decoration is separate from the flat support plane; bound protrusion below a half voxel. Keep tile centres at integer x/z and edges at±0.5, matching the current renderer. Sidewall ownership is deterministic so a riser is neither missing nor doubled across chunks.

Apply this surface to terrain, props, actors, enemies, drops/grave, rings, routes/grid, effects, floaters and camera focus. Root grounding leaves current body/gait animation local. For stair motion, define and test a bounded cosmetic body rise/foot-contact policy along an already legal step; no interpolation may let an actor cross a blocked cliff. Work surfaces and tool contacts inherit the same pad; do not separately offset an anvil and worker.

## Integration points found in current code

| File | Necessary change |
| --- | --- |
| `src/render/three/runtime.ts` | `buildTerrain()` currently emits flat32×32material chunks; replace its generated swatches/quads with authored tile variants. `buildObjects()`, `sync()` and `pose()` place roots at y=0. World swaps must reposition existing roots as well as new objects. Rebuild voxel/static matrices only when the layout changes. |
| `src/render/three/runtime.ts` | `groundAt()` currently intersects an infinite y=0plane. Raycast the rendered ground/deck surface or its exact simplified pick mesh; preserve pointer-drag/pinch behaviour. Tile selection still rounds x/z. Lift selection/route/grid and project hit targets from the sampled height. Camera target/lookAt currently assume0/0.4m; follow the sampled focus height smoothly. |
| `src/render/three/voxel-buckets.ts` | Existing world matrices already support y placement; rebuild bucket bounds and uploads when layout revision changes. Chunk borders/overview must retain raised assets. Do not stream per-frame height uploads. |
| `src/render/three/lighting.ts` | Recompute lamp world anchors from elevated object roots. Check shadow bounds/fog against the elevated camera focus. |
| `src/render/three/voxel-gi-source.ts` and `voxel-gi-core.ts` | GI currently has ground RGB only and an implicit y=0ray intersection. Supply terrace columns/risers and stair surfaces to the worker, replacing that flat-plane fallback. Do not count both raised ground and the old plane. |
| `src/render/three/voxel-gi.ts` | Current8m-high cache starts at y=0. Derive vertical range from the active layout/region so low banks and raised foundations are covered; include ground revision in cache invalidation. |
| `src/render/three/art.ts` and `production-assets.ts` | Ground kit/material bindings and building pad/deck contracts; preserve roof/facade cutaways, gate pivots and metre scale. Bridge art currently puts its deck near y=0. |

## Rendering budget

Reuse chunk ownership, frustum culling and LOD. Ground should not become one `Object3D` per tile or one full solid cube volume per square metre. Native modules can derive exposed surfaces once; group instances by module/rotation/LOD/material within16/32tile chunks. Exclude buried faces and covered terrain. Coarse/distant chunks need low-detail surfaces that preserve bank outline, transition palette and shared edge heights. Avoid T-junction cracks between ground LODs through shared boundary vertices or skirts. Count submitted cells/triangles, draw calls, memory and uploads before choosing per-cube rendering for every ground top:49,152tiles×256top voxels is already12.6million cells before sides.

Use the accepted gentle source lighting/palette approach for art, then apply game lighting separately. Recompute only affected chunks and the GI field on a layout change, not on each600ms simulation tick. Measure actual desktop and physical-phone cost separately; no speed claim follows from instancing alone.

## Simulation and saves

The first ground-art pass remains flat and cosmetic. Elevation requires static layout/navigation integration: unequal-height neighbours connect only through compatible authored stairs/connectors. Vertical risers block cardinal edges; preserve `canStep()`'s existing requirement that both orthogonal routes are legal for a diagonal. `pathfinding.ts` uses eight neighbours and deterministic tie ordering; invalidate its world cache when static connections change. Existing world variants already compose road/gate collision: compose the elevation edge mask with both rather than overriding either.

`TilePosition` stays integer x/y/world/plane and `plane` remains logical floor0; terraces are heights within that floor, not stacked walkable interiors. Preserve600ms movement costs initially. Renderer frames never decide route legality. Keep V5 save/old archive fields intact; derive surface height after load from static authored layout. Before rollout, validate all existing service/resource/quest reachability and repair stale queued paths using established legal-position/path repair, without discarding inventory, XP, quests or belongings. If safe migration of a changed edge graph is not demonstrated, keep the elevated patch opt-in. Stacked floors and climb/jump mechanics are separate future work.

## Sequential gates

1. **Kit and patch.** Author/review the first VOX grass/dirt interiors/transitions,0.5m riser and four-tread stair. Inspect all rotations,3×3junctions, flat top alignment, daytime/mild lighting and phone scale. Do not spread an unreviewed kit across the map.
2. **Ground contract.** Unit-test deterministic variants, masks/corners, shared edge sockets, exactly flat tile heights, stair profile/end levels and level pad/deck continuity. Compare old/new reachability for all service/resource/quest routes; test cliff rejection, stairs and diagonals. Render a single Oakrest patch behind a development toggle.
3. **Grounded integration.** Route a walk/run across every stair direction; assert root/support agreement and legal600ms steps. Inspect large props spanning tiles, anvil contact, roof-off interiors, gates, water/bridge/ferry approaches, drops/grave, ring/route/grid, camera drag/selection, chunk seams and both cameras. Test save/reload, gate/road variants and stale-path repair.
4. **Lighting and rollout.** Verify bank/raised-ground occlusion with actual worker/shader, cache invalidation and offline reload. Capture baseline versus kit/elevation at common camera/settings on desktop, portrait and landscape; record frame p95/GPU times, draw calls, submitted geometry and resident memory. Expand region by region only after tests/build/Pages-path/PWA checks pass. Keep rollback to flat layout while art/performance is under review.

No paid service, runtime generation dependency, external call or deployment is needed for this plan. Asset replacement and terrain gates are independent; a new prop can ship on today's flat ground while the ground kit is reviewed.
