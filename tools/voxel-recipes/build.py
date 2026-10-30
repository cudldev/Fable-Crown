"""Build a local JSON voxel recipe, preserving every previous output directory."""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label, generate_binary_structure

from engine import Recipe, RecipeError, require

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tools/voxel-lab'))
sys.path.insert(0, str(ROOT/'skills/fable-voxel-reference/scripts'))
from voxelize import write_vox, read_vox, write_glb
from plan_asset import make_plan

NAMES = ('front', 'back', 'left', 'right', 'top', 'bottom')


def first_hits(volume, name):
    mask = volume > 0
    axis = 1 if name in NAMES[:2] else 0 if name in NAMES[2:4] else 2
    near = name in ('front', 'left', 'bottom')
    indices = mask.argmax(axis=axis) if near else volume.shape[axis]-1-np.flip(mask, axis=axis).argmax(axis=axis)
    a, b = np.indices(indices.shape)
    result = volume[a, indices, b].T[::-1] if axis == 1 else volume[indices, a, b].T[::-1] if axis == 0 else volume[a, b, indices].T
    if name in ('back', 'left'): result = result[:, ::-1]
    if name == 'top': result = result[::-1]
    return result


def projections(out, recipe, volume, palette, plan):
    folder = out/'inputs'
    folder.mkdir()
    px, py, pz = recipe.pivot
    nx, ny, nz = recipe.shape
    ppv = plan['pixelsPerVoxel']
    size = plan['cellSize']
    clean = Image.new('RGBA', (3*size, 2*size))
    grid = Image.new('RGB', clean.size, '#e9e2d2')
    for index, name in enumerate(NAMES):
        face = first_hits(volume, name)
        rgba = np.zeros((*face.shape, 4), dtype=np.uint8)
        rgba[face > 0, :3] = palette[face[face > 0]-1]
        rgba[face > 0, 3] = 255
        image = Image.fromarray(rgba).resize((face.shape[1]*ppv, face.shape[0]*ppv), Image.Resampling.NEAREST)
        cx, cy = plan['origins'][name]
        offset_x = px if name in ('front','top','bottom') else nx-px if name == 'back' else ny-py if name == 'left' else py
        left = int(cx-offset_x*ppv)
        top = int(cy-(nz-pz)*ppv) if name in NAMES[:4] else int(cy-(ny-py)*ppv) if name == 'top' else int(cy-py*ppv)
        canvas = Image.new('RGBA', (size,size))
        canvas.paste(image, (left, top))
        canvas.save(folder/(name+'.png'))
        position = (index%3*size, index//3*size)
        clean.paste(canvas, position)
        grid.paste(canvas, position, canvas)
        draw = ImageDraw.Draw(grid)
        ox, oy = position
        for d in range(16, size, ppv*4):
            draw.line((ox+d,oy,ox+d,oy+size-1), fill='#a9ada2', width=1)
            draw.line((ox,oy+d,ox+size-1,oy+d), fill='#a9ada2', width=1)
        draw.line((ox+cx,oy,ox+cx,oy+size-1), fill='#c68e65', width=1)
        draw.line((ox,oy+cy,ox+size-1,oy+cy), fill='#c68e65', width=1)
        draw.text((ox+8,oy+8), name.upper(), fill='#202b26')
    clean.save(out/'six-view-clean.png')
    grid.save(out/'six-view-grid.png')
    manifest = {'cellSize': size, 'baseline': plan['baseline'], 'views': {n: {'file': n+'.png', 'origin': plan['origins'][n]} for n in NAMES},
        'geometrySource': 'All six images are first-hit projections of volume.npz; outputs, not independent reconstruction inputs'}
    (folder/'views.json').write_text(json.dumps(manifest, indent=2)+'\n')


def validate_volume(recipe, volume):
    occupied = volume > 0
    _, components = label(occupied, generate_binary_structure(3, 1))
    checks = recipe.document.get('checks', {})
    require(not checks.keys()-{'connected', 'grounded'}, 'Unknown checks fields')
    require(not checks.get('connected', False) or components == 1, f'Expected one connected component; found {components}')
    require(not checks.get('grounded', False) or occupied[:,:,0].any(), 'Expected ground contact')
    return components


def plan_recipe(recipe):
    return make_plan({'assetId': recipe.document['id'], 'mode': 'asset-reference', 'boundsUnits': {'min': recipe.space['min'], 'max': recipe.space['max']},
        'voxelSizeUnits': recipe.pitch, 'worldUnitsPerTile': recipe.space['worldUnitsPerTile'], 'logicalFootprintTiles': recipe.space['footprintTiles'],
        'sizeStatus': recipe.space['sizeStatus'], 'style': {'status': recipe.style['status'], 'profile': recipe.style.get('id')},
        **{k:recipe.scale[k] for k in ('frameVoxels','cellSize','paddingVoxels') if recipe.scale and k in recipe.scale}})


def build_asset(path, out, overrides=None, seed=None):
    out = Path(out)
    require(not out.exists(), 'Output already exists; choose a new directory')
    recipe = Recipe(path, overrides, seed)
    volume, palette = recipe.build()
    components = validate_volume(recipe, volume)
    occupied = volume > 0
    lo, hi = np.argwhere(occupied).min(axis=0), np.argwhere(occupied).max(axis=0)+1
    plan = plan_recipe(recipe)
    out.mkdir(parents=True)
    write_vox(out/'asset.vox', volume, palette)
    decoded, decoded_colors = read_vox(out/'asset.vox')
    require(np.array_equal(decoded, volume) and np.array_equal(decoded_colors[:len(palette),:3], palette), 'Native VOX roundtrip failed')
    mesh = write_glb(out/'asset.glb', volume, palette, recipe.shape[2]*recipe.pitch, recipe.pivot, recipe.document['id'])
    np.savez_compressed(out/'volume.npz', labels=volume, palette=palette)
    projections(out, recipe, volume, palette, plan)
    (out/'scale-contract.json').write_text(json.dumps(plan, indent=2)+'\n')
    # Self-contained input bundle retains relative library/style paths and exact hashes.
    common = Path(os.path.commonpath([str(Path(p).parent) for p in recipe.sources]))
    for source in recipe.sources:
        destination = out/'source-bundle'/Path(source).relative_to(common)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    build_spec = {'recipe': str(recipe.path.relative_to(common)).replace('\\','/'), 'parameters': recipe.params, 'seed': recipe.seed}
    (out/'source-bundle/build.json').write_text(json.dumps(build_spec, indent=2)+'\n')
    report = {'method': 'Modular authored voxel recipe; six views rendered from the volume, not image reconstruction',
        'asset_id': recipe.document['id'], 'parameters': recipe.params, 'seed': recipe.seed, 'dimensions': list(recipe.shape),
        'occupied_voxels': int(occupied.sum()), 'connected_components': components, 'vox_roundtrip': True, 'mesh': mesh,
        'palette': palette.tolist(), 'occupied_bounds_units': {'min': (recipe.low+lo*recipe.pitch).tolist(), 'max': (recipe.low+hi*recipe.pitch).tolist()},
        'physical_scale': {'height_units': recipe.shape[2]*recipe.pitch, 'voxel_size_units': recipe.pitch, 'pivot_voxels': recipe.pivot, 'units_per_tile': recipe.space['worldUnitsPerTile']},
        'touches_xy_boundary': bool(occupied[0].any() or occupied[-1].any() or occupied[:,0].any() or occupied[:,-1].any()),
        'sources': [{'path': str(Path(p).relative_to(common)).replace('\\','/'), 'sha256': h} for p,h in recipe.sources.items()],
        'views_used': list(NAMES), 'art_approved': False, 'game_integrated': False}
    (out/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('recipe', type=Path, nargs='?')
    parser.add_argument('--rebuild', type=Path, help='Replay a saved source-bundle/build.json')
    parser.add_argument('--out', type=Path)
    parser.add_argument('--set', action='append', default=[], metavar='NAME=JSON')
    parser.add_argument('--seed', type=int)
    parser.add_argument('--validate', action='store_true', help='Compile and validate without writing exports')
    args = parser.parse_args()
    try:
        overrides = {}
        if args.rebuild:
            require(args.recipe is None, 'Choose recipe or --rebuild, not both')
            spec = json.loads(args.rebuild.read_text())
            args.recipe = args.rebuild.parent/spec['recipe']
            overrides.update(spec['parameters'])
            if args.seed is None: args.seed = spec['seed']
        require(args.recipe is not None, 'Recipe or --rebuild required')
        assigned = set()
        for assignment in args.set:
            name, raw = assignment.split('=', 1)
            require(name not in assigned, 'Duplicate parameter '+name)
            assigned.add(name)
            overrides[name] = json.loads(raw)
        if args.validate:
            recipe = Recipe(args.recipe, overrides, args.seed)
            volume, _ = recipe.build()
            validate_volume(recipe, volume)
            plan_recipe(recipe)
            print(json.dumps({'valid': True, 'dimensions': recipe.shape, 'occupied': int((volume>0).sum())}))
        else:
            require(args.out is not None, '--out is required for exports')
            report = build_asset(args.recipe, args.out, overrides, args.seed)
            print(json.dumps({k: report[k] for k in ('asset_id','dimensions','occupied_voxels','connected_components','mesh')}, indent=2))
    except (RecipeError, KeyError, TypeError, ValueError, OSError) as error:
        parser.exit(2, 'Recipe error: '+str(error)+'\n')


if __name__ == '__main__': main()
