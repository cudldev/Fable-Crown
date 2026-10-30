# Oakrest source sample

Run `build_environment.py` through BlenderMCP with this folder on Python's import path. It creates editable `bank.blend`, `forge.blend`, `tree.blend` and matching GLBs through the shared pipeline. No external art or services.

- One metre per tile; Blender Z up, front −Y; glTF front +Z.
- Bank/forge footprints: 4×3. Separate `roof`; groups name architecture, work area and props.
- Shared palette atlas, nominal 16 texels/metre. Broad silhouette and material planes precede detail.
- `light-window`/`light-forge` empties carry colour, intensity, range and no-shadow metadata. `window-glass` and `live-coals` identify runtime emissive surfaces.
- Bank has a closed façade with recessed hatch and separate door. Forge has an open work face, masonry firebox, bellows, anvil, tool rack and slate roof. Oak uses sculpted crown rings and forked branches.

Triangle counts, export compatibility and composed appearance need lead verification after MCP execution. These are a curated sample, not a complete world replacement.

## Pass 2 — visual correction draft

Reviewed pass-1 `three-assets-village.png` and `three-assets-bank.png` against the target. Main weaknesses: matching thin-sheet roof silhouettes; broad black banking slot/entrance placement; four obvious spherical canopy masses. Read the project art skill and environment/prop/review references.

Bank now has a thick bell-cast gable/eaves, narrower recessed counter, door centred at x+0.5 and detachable `facade`. Forge uses a shorter hipped slate roof with thick fascia and supported rafter ends. Oak has one connected asymmetric scalloped crown plus a supporting skirt. Props remain unchanged: this pass prioritises visible form hierarchy.

Reviewed exported pass-2 images under `docs/art-audit/three-pass-02/`, including bank/cutaway, forge, tree, all props and village phone/night views. Building/prop silhouette, construction and integration: **usable draft** (distinct roofs, centered doorway, visible cutaway/work areas, grounded useful props). Pixel/material craft: **placeholder** (large flat roof/wall planes and sparse painted cues). Cohesion: **usable draft** in palette and working-place identity; still below the target's organic forms. No reference-quality or production-ready claim.

The pass-2 tree remained **placeholder**: a pointed onion-like crown replaced the separate balls. One focused crown correction flattens/offsets the top, broadens the shoulder and integrates larger scalloped shelves. Reviewed `three-preview/tree.png`, `village-dusk.png` and `village-phone.png`: silhouette/integration now **usable draft** at village scale; leaf form/materials remain **placeholder** (rock-like facets, dark underside shelf, sparse leaf cues). Trunk/roots and all other assets stay frozen. Show as a test preview, not an accepted target match.
