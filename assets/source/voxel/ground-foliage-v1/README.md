# Ground foliage draft

Original, hand-authored single-model VOX150 sources. These files supply the actual runtime shapes; edit them directly, then rebuild. Vite inlines their bytes in the renderer, so no additional runtime download/cache path is needed.

- Shared cubic pitch: 0.0625m (16 cells/metre).
- Native frame: 9×9×16; ground pivot [4.5,4.5,0]. VOX Z is up; native Y maps to negative world Z.
- Grass: 14 cells, 0.3125m high; fern: 28 cells, 0.25m; flower: 12 cells, 0.375m; reed: 35 cells, 0.8125m.
- Muted olive foliage, pale flowers and restrained brown reed heads. No textures or baked directional lighting.

Runtime derives exposed cube faces, instances whole clumps and bends upper vertices with wind. Source files stay rigid and editable. They are small art drafts for the vegetation experiment, not a completed environment asset migration. Actual browser/gallery review: `docs/art-audit/foliage-v1/`.
