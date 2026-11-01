"""Record original physical art briefs and exact prompts before source generation."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets/source/voxel/valley-onboarding'
batch = json.loads((BASE / 'asset-briefs.json').read_text())
for asset in batch['assets']:
    if asset['id'] in ('tent-v1', 'cottage-v1', 'forge-v1'):
        continue
    folder = BASE / asset['id']
    folder.mkdir(exist_ok=True)
    if (folder / 'brief.json').exists():
        raise RuntimeError('Preserve existing source brief ' + str(folder))
    xyz = asset['targetXYZ']
    prompt = f"""Use case: stylized-concept. Generate one original {asset['id'].removesuffix('-v1')} image-to-3D source for Fable Crown, a warm storybook voxel fantasy game.
Structure: {asset['notes']}
Intended physical XYZ dimensions {xyz} metres (Z up). Ground pivot is center XY, minimum Z. Shared cubic pitch 0.0625m (16cells/metre); simplify forms and keep structural attachments broad enough to survive. Important useful gaps must remain real negative space, not dark painted areas. One complete isolated object.
Materials: {asset['materials']}. Broad clean stepped chunky forms, natural restrained material colors and matte opaque surfaces; coherent quiet pigment regions matching the accepted warm voxel oak and cream/blue tent. No outline, tiny embellishments, grain, speckles, weathering or noisy micro-cubes.
One slightly elevated front-right three-quarter view, readable front, side and top planes, restrained orthographic-like perspective. Bright neutral diffuse illumination, strong soft ambient fill and a very gentle broad key with only mild form shading. Most faces remain close to natural base pigment. No deep AO, black cavity, harsh shadows, gloss, highlights, colored/rim lighting or baked dramatic shade.
All supports meet one level ground plane. Generous genuinely transparent padding. No background, ground tile, floor, ground shadow, scenery, other props, character, text, labels, grid, contact sheet or extra views.
"""
    brief = {**asset, 'physicalTargetXYZ': xyz, 'physicalHeightMetres': xyz[2], 'pitchMetres': .0625, 'groundPivot': 'center XY, minimum Z', 'front': '-Y', 'status': 'source/reconstruction pending visual review', 'requestedScope': 'original colored image -> local TRELLIS -> native VOX; no production bake or runtime binding'}
    (folder / 'brief.json').write_text(json.dumps(brief, indent=2)+'\n')
    (folder / 'input.prompt.txt').write_text(prompt)
    print(asset['id'], prompt)
