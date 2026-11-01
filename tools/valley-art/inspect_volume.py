"""Read actual authored/native labels; report volume, grounding and tent corridor."""
import argparse
import json
from pathlib import Path
import numpy as np
from scipy.ndimage import label

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('folder', type=Path)
args = parser.parse_args()
data = np.load(args.folder / 'volume.npz')
volume, palette = data['labels'], data['palette']
report = json.loads((args.folder / 'report.json').read_text())
pitch = report['physical_scale']['voxel_size_units']
occupied = volume > 0
components, count = label(occupied)
sizes = sorted(np.bincount(components.ravel())[1:].tolist(), reverse=True)
center = int(report['pivot_voxels'][0])
projection = occupied.any(axis=1)
clear_width = []
for z in range(volume.shape[2]):
    left = center - 1
    right = center
    while left >= 0 and not projection[left, z]:
        left -= 1
    while right < volume.shape[0] and not projection[right, z]:
        right += 1
    clear_width.append(max(0, right-left-1)*pitch)
result = {
    'dimensionsXYZMetres': [v*pitch for v in volume.shape],
    'occupiedCells': int(occupied.sum()),
    'nativePaletteEntries': len(palette),
    'components': sizes,
    'groundCells': int(occupied[:, :, 0].sum()),
    'centerThroughCorridorWidthByHeight': [{'heightBottom': z*pitch, 'clearWidth': width} for z, width in enumerate(clear_width)],
    'corridorInterpretation': 'Conservative XZ projection across all source-Y depth; positive width proves complete through-space at that height. Not a collision/body acceptance test.',
    'artApproved': False
}
clearance = []
for cells_x, cells_z in [(17,18),(24,24)]:
    candidates = []
    for base_z in range(min(9, volume.shape[2]-cells_z+1)):
        x0 = center-cells_x//2
        blocked_y = occupied[x0:x0+cells_x, :, base_z:base_z+cells_z].any(axis=(0,2))
        starts = np.flatnonzero(np.diff(np.r_[True,blocked_y,True].astype(int)) == -1)
        ends = np.flatnonzero(np.diff(np.r_[True,blocked_y,True].astype(int)) == 1)
        for start,end in zip(starts,ends):
            candidates.append({'floorHeight':(base_z-report['pivot_voxels'][2])*pitch,'sourceYStart':(start+report['grid_min'][1])*pitch,'sourceYEnd':(end+report['grid_min'][1])*pitch,'emptyDepth':(end-start)*pitch,'frontEdgeReached':int(start)==0})
    candidates.sort(key=lambda item:(item['emptyDepth'], -item['floorHeight']), reverse=True)
    clearance.append({'widthMetres':cells_x*pitch,'heightMetres':cells_z*pitch,'bestEmptyCentralBox':candidates[0] if candidates else None})
result['centralRoomClearanceCandidates'] = clearance
(args.folder / 'volume-inspection.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
