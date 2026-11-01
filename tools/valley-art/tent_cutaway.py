"""Derive a roof/front-return cutaway; preserve full physical tent source."""
import json
from pathlib import Path
import sys
import numpy as np
from scipy.ndimage import label

ROOT=Path(__file__).resolve().parents[2]
from _paths import authoring_root
AUTHORING=authoring_root(ROOT)
sys.path.insert(0,str(AUTHORING/'tools/trellis-vox'))
from mesh_to_vox import write_vox,read_vox,write_glb
BASE=ROOT/'assets/source/voxel/valley-onboarding/tent-v2'
source,out=BASE/'vox-04',BASE/'cutaway'
if out.exists():raise RuntimeError('Preserve previous cutaway')
data=np.load(source/'volume.npz');volume=data['labels'].copy();palette=data['palette']
xx,yy,zz=np.indices(volume.shape)
hide=(zz>=22)|((yy<24)&((xx<12)|(xx>=36))&(zz>=10))
volume[hide]=0
out.mkdir()
pivot=[24,24,2]
write_vox(out/'asset.vox',volume,palette)
readback,_=read_vox(out/'asset.vox');assert np.array_equal(readback,volume)
mesh=write_glb(out/'asset.glb',volume,palette,2,pivot,'valley-tent-cutaway')
np.savez_compressed(out/'volume.npz',labels=volume,palette=palette)
report=json.loads((source/'report.json').read_text());_,count=label(volume>0)
report.update({'asset_id':'valley-tent-v2-cutaway','occupied_voxels':int(np.count_nonzero(volume)),'connected_components':count,'ground_cells':int(np.count_nonzero(volume[:,:,0])),'mesh':mesh,'cutaway':{'fullSource':'../vox-04/asset.vox','operation':'Remove roof above1.25m and upper front half of side returns above0.5m for camera visibility; same native grid/pivot. Full physical/GI roof remains in full source.'}})
(out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
(out/'scale-contract.json').write_bytes((source/'scale-contract.json').read_bytes())
parts=json.loads((BASE/'parts.json').read_text());parts['models']={'full':'vox-04/asset.vox','cutaway':'cutaway/asset.vox'};parts['physicalRoofSource']='vox-04/asset.vox; derived camera cutaway does not alter physical roof occupancy'
(BASE/'parts.json').write_text(json.dumps(parts,indent=2)+'\n')
print('TENT_CUTAWAY',report['occupied_voxels'],list(volume.shape),pivot)
