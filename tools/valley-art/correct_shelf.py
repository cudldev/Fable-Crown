"""Retain the learned source-matching shelf plane; discard inferred duplicate arm."""
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import numpy as np
from scipy.ndimage import label

ROOT=Path(__file__).resolve().parents[2]
from _paths import authoring_root
AUTHORING=authoring_root(ROOT)
sys.path.insert(0,str(AUTHORING/'tools/trellis-vox'))
from mesh_to_vox import write_vox,read_vox,write_glb,projections,make_plan
BASE=ROOT/'assets/source/voxel/valley-onboarding/shelf-v1';source,out=BASE/'vox-01',BASE/'vox-shape-01'
if out.exists():raise RuntimeError('Preserve previous native shelf correction')
data=np.load(source/'volume.npz');original,palette=data['labels'],data['palette'];volume=original[:,9:15,:].copy();pivot=[12,3,0]
assert not volume[5:19,:,3:6].any() and not volume[5:19,:,9:12].any(), 'Actual shelf gaps must remain empty'
out.mkdir();write_vox(out/'asset.vox',volume,palette);readback,_=read_vox(out/'asset.vox');assert np.array_equal(readback,volume)
mesh=write_glb(out/'asset.glb',volume,palette,1.25,pivot,'valley-shelf');np.savez_compressed(out/'volume.npz',labels=volume,palette=palette)
plan=make_plan({'assetId':'valley-shelf','mode':'asset-reference','boundsUnits':{'min':[-.75,-.1875,0],'max':[.75,.1875,1.25]},'voxelSizeUnits':.0625,'worldUnitsPerTile':1,'logicalFootprintTiles':[2,1],'sizeStatus':'Retained source-matching learned shelf plane at original pitch; no axis stretch','style':{'status':'candidate','profile':'Original warm timber shelf'},'cellSize':512,'paddingVoxels':8});projections(out,SimpleNamespace(pivot=pivot,shape=volume.shape),volume,palette,plan)
report=json.loads((source/'report.json').read_text());_,count=label(volume>0)
report.update({'dimensions':list(volume.shape),'grid_min':[-12,-3,0],'grid_max':[12,3,20],'pivot_voxels':pivot,'physical_scale':{'height_units':1.25,'voxel_size_units':.0625,'pivot_voxels':pivot,'units_per_tile':1},'occupied_voxels':int(np.count_nonzero(volume)),'connected_components':count,'ground_cells':int(np.count_nonzero(volume[:,:,0])),'mesh':mesh,'native_correction':{'raw':'../vox-01','operation':'Retain original nativeX plane by cropping sourceY9:15; removes inferred perpendicular duplicate shelf. Actual two shelf gaps remain empty without a new carve. No per-axis scaling, no color replacement.','originalGrid':[24,24,20],'retainedGrid':[24,6,20]},'art_approved':False})
(out/'report.json').write_text(json.dumps(report,indent=2)+'\n');(out/'scale-contract.json').write_text(json.dumps(plan,indent=2)+'\n');print('SHELF_CORRECTION',report['occupied_voxels'],volume.shape,pivot,count)
