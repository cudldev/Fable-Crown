"""Sequential pinned local reconstruction/conversion in isolated art ownership."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
from _paths import authoring_root
AUTHORING = authoring_root(ROOT)
BASE = ROOT / 'assets/source/voxel/valley-onboarding'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('assets', nargs='+')
args = parser.parse_args()
for asset in args.assets:
    if not asset.replace('-', '').isalnum():
        raise ValueError('Invalid asset ID')
    folder = BASE / asset
    brief = json.loads((folder / 'brief.json').read_text())
    if not (folder / 'input.png').is_file():
        raise RuntimeError('Missing reviewed original source ' + asset)
    for phase, script, command in [
        ('trellis-01', 'run_trellis.py', ['--image', str(folder / 'input.png'), '--out', str(folder / 'trellis-01'), '--seed', '42', '--steps', '12']),
        ('vox-01', 'mesh_to_vox.py', ['--source', str(folder / 'trellis-01/raw-mesh.npz'), '--out', str(folder / 'vox-01'), '--height', str(brief['physicalHeightMetres']), '--pitch', '.0625', '--colors', '24', '--asset-id', asset])
    ]:
        complete = 'generation.json' if phase == 'trellis-01' else 'report.json'
        if (folder / phase / complete).is_file():
            print('PRESERVED_COMPLETE', asset, phase, flush=True)
            continue
        subprocess.run([sys.executable, str(AUTHORING / 'tools/trellis-vox' / script), *command], cwd=AUTHORING, check=True)
    subprocess.run([sys.executable, str(ROOT / 'tools/valley-art/inspect_volume.py'), str(folder / 'vox-01')], cwd=AUTHORING, check=True)
    report = json.loads((folder / 'vox-01/report.json').read_text())
    print('ASSET_NATIVE_COMPLETE', json.dumps({'id': asset, 'dimensions': report['dimensions'], 'cells': report['occupied_voxels'], 'components': report['connected_components'], 'artApproved': False}), flush=True)
