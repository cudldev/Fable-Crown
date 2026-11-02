# Voxel surface detail — 2026-11-02

Native voxel objects and voxel-derived terrain use a fixed source-aligned 6.25cm detail grid. The quieter profile keeps a visible weak bevel while reducing the strongest relief. Interiors stay flat, without grain or tilted facets. Geometry and source VOX files remain unchanged; pixel actors, foliage and non-voxel models retain their materials.

A deterministic 16³ R8 diffuse field is baked once on the CPU and shared by all live materials. Its gently clustered values span250–255, below2%linear darkening before the variation control. Cell-center sampling gives each near voxel a flat tone; continuous texture gradients select real hardware mipmaps at distance. Repeat wrapping, nearest magnification and trilinear minification keep the layer quiet. There is no automatic grid enlargement or external asset request. The final material releases the shared GPU texture; CPU data remains cached.

Analytic bevel gradients avoid derivatives across cell boundaries. Bevel widths span0.07–0.14cells and depths0.029–0.035cells. The relief multiplier starts at1 and adds at most0.45times variation; the smooth slope bound caps normal deviation below9.1°. Pixel-footprint filtering fades unresolved normal relief while the diffuse mip chain retains its mean tone. Source origin and pitch stay stable across mesh LODs and instance transforms.

Camera settings expose **Voxel depth** (default0.2), **Voxel variation** (default1.0) and Reset. Depth0 exactly restores original colors and normals. Touch, keyboard and controller adjustment share cosmetic preferences outside game saves. Legacy Visual settings copies/resets the same two values. Uniform changes do not rebuild geometry or GI.

Shader hooks preserve pigment, AO, transitions, GI and world curvature. Reflections wait for an allocated sun-shadow map before sampling its comparison texture. Relief changes lighting, not silhouettes or physical shadow geometry.

Evidence: [host measurements](performance/voxel-surface-detail/README.md), [actual captures](screenshots/voxel-surface-detail). Local GPU checks cover exact zero-depth output, flat interiors, weak/strong cells, transform covariance,18minification/offset samples, all five hardware mip levels and texture disposal. Physical-phone performance remains unmeasured.
