# Modular voxel recipes

Offline asset authoring, separate from the game. JSON recipes assemble reusable modules using one Python voxel engine. No node editor, image reconstruction, runtime generator, service, key or additional game dependency. Concepts guide the human/Codex-authored recipe; the tool does not automatically infer geometry from an image. Art remains draft until reviewed.

## Run

Requires Python with NumPy, Pillow and SciPy. The npm wrapper uses VOXEL_PYTHON when set, otherwise this workspace's existing .tools/sculpt-v2-env, otherwise system Python. Browser captures use the project's existing Playwright and Chrome.

```powershell
npm run voxel:build -- tools/voxel-recipes/recipes/barrel.json --out assets/explorations/voxel/my-study/barrel-01
npm run voxel:build -- tools/voxel-recipes/recipes/barrel.json --set radius=0.375 --set height=0.75 --seed 23 --out assets/explorations/voxel/my-study/barrel-short-01
npm run voxel:build -- tools/voxel-recipes/recipes/oak.json --validate
npm run voxel:preview -- my-study barrel-01
npm run voxel:compare -- recipe-system-v1 oak-03 barrel-04
npm run voxel:test
```

Each output directory must be new. A build saves native editable asset.vox, asset.glb, volume.npz, physical scale contract, six transparent projections, clean/grid sheets, report and a self-contained source-bundle. Colors and geometry are deterministic for the same inputs, seed and tool environment. Replay a frozen recipe including its styles/modules/profile:

```powershell
npm run voxel:build -- --rebuild assets/explorations/voxel/recipe-system-v1/barrel-04/source-bundle/build.json --out assets/explorations/voxel/my-study/barrel-rebuilt-01
```

Capture commands save screenshots/reports. With npm run dev, open /tools/voxel-recipes/compare.html or /tools/voxel-lab/viewer.html?asset=recipe-system-v1&job=oak-03 for interactive review. The comparison page rejects different voxel pitches and compares independently loaded VOX/GLB bounds. Single-asset beauty captures frame the individual object; only the comparison and common-frame six-view sheets establish relative scale.

## How a recipe is defined

- profiles/game-scale.json owns cubic voxel pitch, world/tile units and a common six-view physical frame. Current16voxels/metre and provisional4m oak/1m barrel are test values, not approved game-wide dimensions. Recipes using a shared profile cannot override its density.
- styles/warm.json owns named material colors. Solid is the default. Optional pattern=patches must be chosen explicitly with patchSize; it is mathematical color variation, not reference-image detail. Assign different materials to designed parts or use paint masks for intentional color areas.
- modules/basic.json contains parameterized node graphs: tree.limb, tree.foliage-cluster and prop.hoop. Modules can compose other modules; cycles fail.
- recipes/*.json records physical bounds, footprint, parameters, module placement, output node and checks. Coordinates are metres relative to the ground pivot: Xright,Yback,Zup. Rotations are XYZ Euler degrees, applied X then Y then Z; transforms scale about origin, rotate, then translate.
- engine.py samples that graph at cell centers. build.py exports the resulting volume and renders six views FROM it. This is the closer authored-volume approach, generalized; the old tree-specific script remains intact.

To create another asset, copy a recipe, choose physical bounds first, assemble existing nodes/modules and define explicit materials. Add a new module when a useful group repeats. Extend Python only when a genuinely new shape operation is needed. Put assumptions about hidden geometry in the recipe description; do not imply it was recovered from a concept.

## Node contract (version1)

nodes is an object of unique names; output names one node. References are other node names in the same graph. Forward references work. Node fields are strict; unknown operations, fields, materials, parameters and cycles fail. No eval, embedded Python or executable plugins.

| op | Required fields | Optional fields / behavior |
|---|---|---|
| box | center,size,material | Axis-aligned positive XYZ size |
| ellipsoid | center,radii,material | exponent1..8 (default2); step controls local contour quantization |
| sweep | points,material | XYZR path, varying positive radius, round sections |
| lathe | profile,material | center; increasing [height,radius] profile revolved about Z |
| union | inputs | Later occupied inputs win material overlaps |
| intersection | inputs | Keeps first input's colors where every input is occupied |
| difference | base,cut | Removes cut occupancy from base |
| transform | input | translate,rotate,uniform positive scale; no non-cubic voxel stretching |
| repeat | input,count,offset | count1..64; optional nonnegative XYZ jitter, seeded per node |
| module | module | params; instantiates a named graph from libraries |
| paint | input,mask,material | Changes colors inside occupied input AND mask; never adds cells |

Parameters declare type/default, optional min/max for numeric types, and description. Types: number,integer,vector,points,material. A value can be {"$param":"height"}. Numeric expressions support $add,$mul (two or more operands), $sub,$div (two). Expressions are data, not strings of code. Example nodes:

```json
{
  "branch": {"op":"module","module":"tree.limb","params":{"points":[[0,0,0,0.2],[0.3,0,1,0.08]]}},
  "cluster": {"op":"module","module":"tree.foliage-cluster","params":{"material":"leaf-sage"}},
  "placed-leaves": {"op":"transform","input":"cluster","translate":[0.3,0,1],"scale":0.5},
  "whole": {"op":"union","inputs":["branch","placed-leaves"]}
}
```

Use actual recipes for complete documents. Physical bounds must align to the voxel grid. The ground pivot must be within XY bounds, minZ=0. Limits:256cells/axis,2million cells,255palette entries; explicit bounds clip geometry, so inspect touches_xy_boundary and rendered silhouettes. Empty padding belongs to the grid, not occupied dimensions. VOX itself stores cells; scale-contract.json supplies metre mapping, and GLB embeds the intended physical size.

## Validation and art review

Tests cover CSG/material precedence, transforms, seeded repetition, modules/recursion, parameter validation, round lathe/tapered sweep, painting, asymmetric pivots, first-hit occlusion, shared scale, reproducible source-bundle exports and overwrite protection. Optional checks.connected/checks.grounded apply to both validation and builds. Native VOX is read back, then browser loaders independently check VOX/GLB; comparison verifies equal bounds without per-object scaling.

Review actual exported front/side/back/three-quarter views and a shared-camera scale comparison. Tools do not certify likeness, hidden structure, game camera readability, rigging or performance. Never regenerate over artist-edited VOX/Blender files: keep the edit or intentionally start a new job. Current tree still has repeated cluster shapes; barrel lacks authored stave grooves. These are module/recipe art tasks, not proof the export failed. Characters, buildings, mesh input, animation and a visual node editor are future modules/features, not implemented generators.
