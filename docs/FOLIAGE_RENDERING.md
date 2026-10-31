# Layered ground vegetation

Original small pixel charts in `src/render/three/foliage-art.ts` supply seven vegetation types. Painted cells remain0.0625m. Upright plants use crossed cutout cards (four triangles); low leaf mats use one horizontal card (two triangles). No downloaded art, service, new dependency or gameplay state is required.

## Ground-to-grass transition

Presentation-only habitat masks keep roads, building/service footprints, crops and collision cells clear. A distance band around bare areas introduces0.1875m short grass before the0.375m grass/ferns and occasional0.6875m shrubs. Low leaf mats connect the ground beneath deeper patches. Smooth coordinate-hash fields add glades and mixed heights instead of equal-height walls. Reeds remain0.8125m at shorelines. Native-grid roots and90° turns remain; no random tilt or scale distorts the pixel pitch.

Flowers have their own patch field, card material and stem/petal artwork. Flower colors are not baked into grass, mats or bushes, and petals do not receive terrain-hue tint.

## Color and lighting

Each leafy card samples four unlit native terrain texels around its actual foot when instances upload. Root tint blends70%ground pigment with30%plant pigment, bounded to avoid extreme hues, plus deterministic per-card brightness variation. Tips retain more original pigment. No per-frame GPU readback or lighting bake is used; fallback ground keeps the base palette. Broken green root pixels replace the former dark stripe.

Tip refinement: restrained highlight pigment and85%retention of the ground/card tint at the tips prevent pale caps from washing out variation. Grass/short grass now share four authored blade patterns in tiny atlases, selected from fixed world-cell coordinates. Brightness spans0.86–1.08 with a small warm/cool shift. Pixel pitch, geometry and instance-buffer size remain unchanged; camera movement does not change a card's pattern.

Normals blend the card face with world up after double-sided correction:85%upward at the base,55%near the tips. This softens wall-like shading while retaining directional response. Native sun/lamp lighting, received shadows and sampled GI remain active. Wind changes top vertices; roots remain fixed, reduced motion straightens plants, and600ms simulation/RNG/saves stay independent.

## Depth, overlap and bounds

Character bodies/tools retain ground-pivot depth. Vegetation keeps each card column's support depth and the two-unit raster offset that prevents base clipping, including curved/reflected views. A stable neighbour-halo priority filter removes any upright pair whose card planes would be coplanar and overlapping. Ground mats are aligned to single tiles and meet without overlapping. The result is independent of camera-window boundaries; no depth jitter hides geometry conflicts.

Visual settings → Vegetation still controls enable, density and wind, with saved preferences. The28m fade and bounded34m instance window remain; uploads occur on8m region/density/world changes. Extra layers reserve4,096mat,2,048shrub and16,000short-grass slots rather than the32,000ceiling of each original type. Overview hides foliage. Alpha overdraw, repeated silhouettes, flat-world grounding and approximate wind normals remain limitations; physical-phone performance is unmeasured.

Current evidence: [quieter tips and card variation](art-audit/foliage-tips-v6/README.md); [layered vegetation](art-audit/foliage-layers-v5/README.md) records the earlier layer/edge pass. Earlier studies remain preserved. No deployment is implied.
