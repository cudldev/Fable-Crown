# Tent source and native draft

Original built-in imagegen source (`input.png`, exact prompt retained) → pinned local TRELLIS seed42/12steps → raw native `vox-01`. The model inferred a closed entrance, so explicit authored corrections preserve raw files and produce `vox-04`: doorway/interior carve, compact stake-tip crop, canopy repair and floor pivot. `vox-02/03` preserve intermediate corrections. No axis stretch or new palette colors.

Use `vox-04/asset.vox` with `parts.json`:3×3m footprint,2m total extent;0.0625m cubic pitch; pivot[24,24,2]. The actual floor top is runtime0m, with0.125m base/stake cells buried. The1.5m wide×1.5m high clear entrance continues2.375m into the shelter. The1.0625m wide×1.125m high body box fits2.625m depth.

Actual native previews: `review-vox-04/vox-iso.png`, `vox-front.png`, `vox-top.png`, `vox-unlit.png` and `phone.png`. Independent Three.js VOX/GLB loading, shared dimensions, zero external requests and GL error0 pass. Native readback matches11,508cells/24colors/one connected component. Native MagicaVoxel app and actual game integration are unverified. Lead-only Blender recipe: `tools/valley-art/review_blender.py`.

Visual review: silhouette **usable draft** (recognizable cream/blue wall tent); construction **usable draft** (real clear opening and sealed canopy); material **usable draft** (quiet broad pigment with residual inferred shade); cohesion **usable draft** (warm timber and stepped canvas); integration **placeholder** (floor/socket metadata checked, actual game character/camera pending). The inferred low rear opening remains. Final art acceptance belongs to the lead/user; source images alone are not completed assets.
