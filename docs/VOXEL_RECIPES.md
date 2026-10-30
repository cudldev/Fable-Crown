# Modular voxel authoring

[Recipe engine and authoring guide](../tools/voxel-recipes/README.md). Recipes now combine shared operations/modules; they do not reconstruct images. Keep the six-view image-carving experiment separate.

Current examples: [oak recipe](../tools/voxel-recipes/recipes/oak.json), [barrel recipe](../tools/voxel-recipes/recipes/barrel.json), [shared scale](../tools/voxel-recipes/profiles/game-scale.json), [editable style](../tools/voxel-recipes/styles/warm.json). The recipe is manually interpreted from the concept; fidelity depends on authored proportions, clusters, gaps and material placement.

Both use16voxels/metre and the same physical six-view frame. Test heights are4m oak and1m barrel, still provisional. [Shared-camera comparison](../assets/explorations/voxel/recipe-system-v1/comparison-oak-03-barrel-04/iso.png). Individual beauty images auto-frame for inspection and cannot establish relative scale.

Six-view outputs, exported bounds and successful tests are technical evidence. Art acceptance is separate. Optional exploration only; no game integration or art-default change.
