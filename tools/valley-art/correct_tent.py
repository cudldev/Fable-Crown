"""Bounded native correction of learned tent: source-requested doorway and pad."""
import hashlib
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import numpy as np
from scipy.ndimage import label

ROOT = Path(__file__).resolve().parents[2]
from _paths import authoring_root
AUTHORING = authoring_root(ROOT)
sys.path.insert(0, str(AUTHORING / 'tools/trellis-vox'))
from mesh_to_vox import write_vox, read_vox, write_glb, projections, make_plan

BASE = ROOT / 'assets/source/voxel/valley-onboarding/tent-v2'
source, out = BASE / 'vox-01', BASE / 'vox-04'
if out.exists():
    raise RuntimeError('Preserve previous correction draft')
raw = np.load(source / 'volume.npz')
original, palette = raw['labels'], raw['palette']
volume = original[2:50, 1:49, :].copy()
before = volume.copy()
# Centre24cells=1.5m wide,24cells=1.5m clear above2cell=0.125m floor.
# Front source-Y is min Y; stop before the inferred rear canvas, never close it.
volume[12:36, 0:38, 2:26] = 0
roof_patch_columns = 0
for x in range(12,36):
    for y in range(0,38):
        old_roof = np.flatnonzero(before[x,y,22:]) + 22
        if len(old_roof) and not volume[x,y,26:].any():
            # Lift only canopy columns lost to the clear doorway prism.
            # A two-cell shell closes the visible slot and joins adjacent steps.
            volume[x,y,26:28] = before[x,y,old_roof[-1]]
            roof_patch_columns += 1
removed_doorway = int(np.count_nonzero(before)-np.count_nonzero(volume))
trimmed_stake_cells = int(np.count_nonzero(original)-np.count_nonzero(before))
pitch, pivot = .0625, [24,24,2]
plan = make_plan({'assetId':'valley-tent-v2-corrected','mode':'asset-reference','boundsUnits':{'min':[-1.5,-1.5,-.125],'max':[1.5,1.5,1.875]},'voxelSizeUnits':pitch,'worldUnitsPerTile':1,'logicalFootprintTiles':[3,3],'sizeStatus':'Exact3x3m native extent;2m total height; pivot at actual interior floor top. Stake/base0.125m is buried. Original learned raw and uncropped volume preserved.','style':{'status':'candidate','profile':'TRELLIS cream-blue wall tent with explicit source-matching native doorway correction'},'cellSize':512,'paddingVoxels':8})
out.mkdir()
write_vox(out / 'asset.vox', volume, palette)
readback, decoded_palette = read_vox(out / 'asset.vox')
assert np.array_equal(readback,volume) and np.array_equal(decoded_palette[:len(palette),:3],palette)
mesh = write_glb(out / 'asset.glb', volume, palette, 2, pivot, 'valley-tent')
np.savez_compressed(out / 'volume.npz', labels=volume, palette=palette)
projections(out, SimpleNamespace(pivot=pivot,shape=volume.shape),volume,palette,plan)
(out / 'scale-contract.json').write_text(json.dumps(plan,indent=2)+'\n')
components,count = label(volume>0)
report = json.loads((source / 'report.json').read_text())
report.update({'asset_id':'valley-tent-v2-corrected','dimensions':list(volume.shape),'grid_min':[-24,-24,-2],'grid_max':[24,24,30],'pivot_voxels':pivot,'occupied_voxels':int(np.count_nonzero(volume)),'connected_components':int(count),'ground_cells':int(np.count_nonzero(volume[:,:,0])),'walking_floor':{'runtimeHeightMetres':0,'sourceVolumeTopCell':2,'pivotZCells':2,'buriedBaseMetres':.125,'supportCellsBelowFloor':int(np.count_nonzero(volume[:,:,:2]))},'mesh':mesh,'vox_roundtrip':True,'physical_scale':{'height_units':2,'voxel_size_units':pitch,'pivot_voxels':pivot,'units_per_tile':1},'native_correction':{'source':'../vox-01/volume.npz','sourceSha256':hashlib.sha256((source/'volume.npz').read_bytes()).hexdigest(),'originalGeometryPreserved':True,'operation':'crop outer2X/1Y cells of learned stake tips; carve source-requested central doorway/room prism; lift lost canopy columns to a2cell shell above1.5m clearance; set pivot at actual interior floor top','trimmedStakeCells':trimmed_stake_cells,'netRemovedDoorwayCells':removed_doorway,'liftedCanopyColumns':roof_patch_columns,'clearancePrismSourceXYZMetres':{'min':[-.75,-1.5,0],'max':[.75,.875,1.5]},'noAxisStretch':True,'noColorEdits':True},'art_approved':False,'game_integrated':False})
(out / 'report.json').write_text(json.dumps(report,indent=2)+'\n')
(BASE / 'parts.json').write_text(json.dumps({'id':'valley-tent-v2','nativeJob':'vox-04','unitsPerTile':1,'pitch':pitch,'sourceAxes':'Z up, front-Y; runtimeY up,front+Z','logicalFootprint':[3,3],'visualExtentXYZ':[3,3,2],'groundPivotVoxels':pivot,'interiorFloorMetres':0,'buriedBaseMetres':.125,'entrance':{'side':'south','width':1.5,'height':1.5,'centerSourceXYZ':[0,-1.5,0]},'clearInteriorPrism':report['native_correction']['clearancePrismSourceXYZMetres'],'parts':[{'id':'shelter','file':'vox-04/asset.vox','visible':'always'}],'construction':None,'provenance':'Original built-in imagegen source -> pinned local TRELLIS -> native VOX -> explicit bounded native doorway/stake/canopy correction. No paid endpoint or runtime dependency.','status':'usable draft pending lead Blender and actual game review'},indent=2)+'\n')
print(json.dumps({'occupiedCells':report['occupied_voxels'],'components':count,'trimmedStakeCells':trimmed_stake_cells,'removedDoorwayCells':removed_doorway,'dimensions':volume.shape},indent=2))
