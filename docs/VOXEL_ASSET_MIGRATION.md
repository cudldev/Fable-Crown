# Complete voxel asset migration

> Current actor update (2026-10-30): the user approved the full pixel billboard cast in the voxel world. See [cast implementation](PIXEL_CAST.md) and [generation skill](../skills/fable-pixel-characters/SKILL.md). Earlier voxel-volume/rig requirements for characters and enemies below are superseded; environment migration and gameplay contracts remain.


Requested2026-10-30: replace the current3D asset set in the accepted oak's voxel style, add an artistic ground tile kit and use Minecraft-like flat block terraces so props attach to even ground. This is the migration inventory and remaining work, not a claim that every asset has already been converted. [VOXEL_PIPELINE.md](VOXEL_PIPELINE.md) governs generated props; [TERRAIN_ELEVATION_PLAN.md](TERRAIN_ELEVATION_PLAN.md) owns terrain heights.

## Current inventory

Counted from the actual `WORLD` export in `src/rpg/world.ts`:421 base objects, plus one restored bridge after the road quest. Repeated instances share templates;421 separate generations are unnecessary.

| Family | Instances / distinct designs | Required voxel behavior |
| --- | --- | --- |
| Trees |240:120Mosswood,60oak,60willow | Already one accepted oak VOX for all. Add recognisable species silhouettes later; available/stump, grounded roots and controlled crown overhang. |
| Ore |30:12copper,6tin,6iron,6coal | One coherent outcrop family, four readable ore materials, depleted outcrop and respawn. A stump-like height crop alone loses ore-state intent. |
| Work props |3anvils,3ranges | Anvil horn/waist/support at working height; range hearth/pot, heat/light socket and opaque opening. |
| Fishing |9spots:3each shrimp/sardine/trout | Basket/resting rod shore kit with appropriate water/shore placement. Shared art is sufficient; resource identity stays in gameplay. |
| Decoration |8crop beds,7supply groups | Grounded vegetable modules; independent crate/barrel/logs assembled into supply variants. Current production override replaces a whole `prop-supplies` group with one crate GLB. |
| Clues and target |11clues,1archery target | Ledger/stand reusable baseline; later letter, tracks, banner and campfire identities for the actual clues. Target needs readable rings and support. |
| Buildings |3banks,3furnaces,5shops,8other buildings | Banks4×3; furnaces2×2; shops4×3; cottages5×3; workshops4×3; manor6×5; ruined watch5×4. Separate roof/facade/interior, matching entrances and counters. |
| Crossing and boundary |2bridges,54fences,3gates,2ferries | Bridges10×3 plus restored third bridge; repeatable span/end modules. Fence1m joins on both orientations; gate hinge and open/closed states. Boat/shore sockets for ferries. |
| Signs and landmarks |8signs,15landmarks |13landmarks intentionally have no mesh: preserve navigation/labels without adding arbitrary props. The2`ruins` landmarks currently look like notice boards; give shrine/camp distinct art. |
| Quest people |6 | Ren,Hana,Toma,Iori,Nell,Edda retain individual identity; currently fallback smith/cook/merchant figures. They are separate world objects, not extra simulated NPCs. |
| Moving people |24total | Alden plus23NPCs:6woodcutters,5miners,6fishers,6smiths. Shared modular body/rig with original costume, skin/hair/tool variants. |
| Enemies |12spawns,6definitions |3boars,3rock mites,3bandits,1captain,1armoured outlaw,1ranged outlaw. Keep target selection, facing, hit/death visibility and future motion. |
| Small dynamic art |Loot bags,grave,projectiles/contact feedback | Currently runtime primitives rather than asset-library entries; include bag,gravestone and arrow/small impact modules in completion audit. Selection rings/routes remain legibility overlays. |
| Ground |5logical terrain types |Grass,dirt,stone,sand,water. Artistic top surfaces, joins,shores and height edges share one tile contract; water has a constant surface level. |

Evidence: `src/rpg/types.ts`, `world.ts`, `content.ts`, `engine.ts`; `src/render/three/art.ts`, `production-assets.ts` and `runtime.ts`. There are19`WorldObject.kind` values. The legacy production manifest has7regular GLB templates(bank,forge,tree,Alden,anvil,crate,lantern), plus optional ink/fitted Alden variants; most remaining object types are code-authored fallback art. Therefore voxelizing only those7GLBs would leave much of the world unmigrated.

## Shared asset contract

- One tile/metre; cubic pitch0.0625m(16cells/metre), subject-specific physical dimensions. Never stretch X/Z independently to fill a logical footprint. Ground pivot and overhang are explicit. Partition a source exceeding256cells on any VOX axis.
- Each distinct generated prop starts with one colored three-quarter image, gentle neutral diffuse shading, natural matte colors and broad forms. Use the established local TRELLIS→Trimesh→VOX path; retain prompt,input,raw mesh,scale contract,palette,components and actual previews. Six-view sheets inspect the resulting volume.
- Props should share the oak's broad quiet color groups. Ore colors must survive a coarse LOD; reserve sparse warm/cool accent groups rather than random noise or a common brown palette for every material.
- Bind objects by `kind` plus resource/style variant before legacy GLB lookup. A failed optional binding retains a usable explicit fallback and diagnostic; completeness is measured separately so fallback cannot silently count as conversion.
- Native VOX150 currently carries one model and RGBA. Store metre pitch,pivot,source provenance,explicit depleted-model references,parts/sockets and emission information in validated local metadata. A main/depleted pair uses the same coordinates and pivot. Do not assume color alone provides emission.
- Reuse immutable parsed grids, derived LODs and AO. Static parts enter16×16tile buckets; availability,roof/facade visibility and transforms must participate in upload invalidation. Do not upload every static cube each frame.
- Keep moving hinges and actors in dedicated dynamic batches. Existing `RigidActorArt` requires body,left/right arms,left/right legs,tool and optional cape; retain these pivots until a reviewed replacement adapter exists. Current character target is mostly authored frame-by-frame voxel poses with selective squash/stretch tweening, not rigid-part motion alone. Preserve per-frame ground/tool/cape anchors and cubic cells; see [character animation direction](ART_DIRECTION.md#character-animation-direction--2026-10-30). A static whole-person VOX is not an animated replacement.
- Keep GI occupancy/material capture aligned with the native cells and state. Hiding roofs for the camera must not remove physical roof blockers. Lantern/coals need separate emissive metadata and light anchors; current voxel GI boxes contain only position,pitch and RGB.

## Ground tile kit

Current source art: [terrain-style-a-v2](../assets/source/voxel/terrain-style-a-v2/README.md), following the selected warm-storybook A.288editable modules cover base material phases,soft joins,stone and stairs, reviewed as an isolated patch. This completes an initial native ground-art pass, not world integration or a complete autotile/water kit; retain the remaining steps below.

Create an authored material/tile family, not a noisy random patch per world cell. Start with matching top surfaces for grass,path dirt,stone and sand, plus a restrained water surface. At the shared pitch, a1m tile is16×16cells horizontally. Declare top elevation separately from slab thickness; do not normalize each tile by its image height.

Add a small number of broad material variants, straight/convex/concave transition masks, river-bank joins and exposed earth/stone side profiles. Choose transitions from a shared neighbor mask so adjacent cells agree; rotate symmetric pieces rather than painting every orientation. Roads need quiet centers and broken grassy edges; sand/water transitions follow actual shoreline topology. Avoid repetitive dark outlines around every square.

Use a single flat top per1m tile,vertical exposed sides and an initial0.5m level proposal(8voxels); join height changes with explicit stairs rather than smoothly warping the ground. Every prop sits on an even tile and every multi-tile building/work area uses a level pad. The same surface contract positions props,feet,routes,picking and GI. Native terrain VOX is the authoring data; derive reusable optimized top/side/stair surfaces and LODs for instancing rather than materializing all buried ground voxels as visible cubes. Compare a terrain patch at gameplay camera and phone scale before filling the world.

## Ordered delivery

1. **Ground palette and first prop/resource family.** Review one material patch and one ore/anvil at shared oak/actor scale, then produce copper/tin/iron/coal,anvil,crate/barrel/logs,basket and crop modules. Preserve explicit depleted-ore art and use the actual3D preview before expanding.
2. **Infrastructure and readable work areas.** Fence/gate/sign,target,ledger,ferry and bridge modules; range/hearth/lantern plus working light sockets. Verify gate animation and restored crossing in the actual world.
3. **Modular structures.** Bank,forge,shop,cottage,manor,ruin families with compatible1m wall/floor bays and generated original facades/roofs where suitable. Use constructed open interiors and separate roofs; monolithic image-inferred solids do not prove playable interiors.
4. **Animated cast and creatures.** Simplify Alden into coarse readable cubic forms first, then author discrete idle/walk/work voxel poses with selected squash/stretch transitions. Review actual voxel playback before profession/quest variants and enemies. Preserve current motion/tool behavior until each replacement actually walks,works and holds equipment at correct contact points. Keep existing optional character studies accessible for comparison.
5. **Completeness and consistency.** Audit every object binding,terrain type,drop/grave,equipment pose and enemy definition. Add Mosswood/willow variation if still missing. Compare the whole village in neutral day and accepted dusk lighting, then close/overview/mobile views.

## First resource/prop batch contract

Suggested initial specs are provisional until compared beside the existing1.91m Alden and4m oak: outcrop0.75–1m high on1×1logical tile; supported anvil approximately1m high on1×1; crate0.75m high; barrel0.875–1m high; basket0.5m high. Preserve reference aspect ratio and record measured XYZ; do not silently change pitch to make details survive. Ground pivot is model origin; current VOX sourceZ becomes runtimeY and sourceY becomes negative runtimeZ.

For ore, add reusable native `ore-depleted` geometry and separate four material variants. Extend the loader to resolve an optional depleted-asset ID while retaining legacy `cutHeight` for trees. Validate missing IDs,cycles and compatible physical coordinates. `voxelObject` should retain available/depleted groups so existing harvesting/selection code still works. Review both states together; ensure the worker rebuild selects their matching occupancy/colors.

## Existing VOX drafts

- `trellis-oak-softlight-v1/vox-01/asset.vox` is the accepted baseline and current `public/art3d/voxel/tree.vox` source.
- Earlier `trellis-oak-v1`,grounded six-view oak and hand-authored volume/recipe oaks are experiments; keep as history rather than replacing the accepted tree by accident.
- `anvil-v5/six-view-48-color-v2/asset.vox` and older anvil outputs exist. They came from the superseded six-view workflow; scale/style need new review. They are useful comparisons, not newly accepted pipeline output.
- `recipe-system-v1/barrel-04/asset.vox` exists at provisional1.375m height/1.25m width. It is a procedural draft, oversized for the proposed common prop scale; no automatic substitution or hidden rescaling.

## Per-batch acceptance

1. Inspect actual source and voxel front/side/back/three-quarter,unlit colors and common-scale game/phone views. Ground contact,recognisable silhouette and useful gaps must survive; technical export alone does not establish art acceptance.
2. Native VOX readback,independent browser load,metre scale/pivots and palette pass; files/provenance stay local. Test all required states,orientation,cutaways and animation contacts.
3. Run appropriate renderer/state tests plus test/build/dist gates. Verify repository-base paths,PWA/offline reload and no required external runtime calls. Save/replay/inventory/600ms simulation remain unchanged.
4. Record source IDs and remaining fallback bindings; capture draw/instance/upload counters and measured frame/GPU times in comparable views. Instancing alone is not a performance guarantee; retain actual-mobile benchmarking as a separate gate.

No new runtime service,paid endpoint or model download is required to play. Full replacement remains open until the completion audit passes; no deployment is implied by this plan.
