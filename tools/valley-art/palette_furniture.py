"""Explicit local art palette ramp, preserving raw learned source and all geometry."""
import argparse
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
from _paths import authoring_root
AUTHORING=authoring_root(ROOT)
BASE=ROOT/'assets/source/voxel/valley-onboarding'
sys.path.insert(0,str(AUTHORING/'tools/trellis-vox'))
from mesh_to_vox import write_vox,read_vox,write_glb,projections

RAMPS={'wood':[(130,94,55),(148,109,64),(166,125,74),(184,141,86)],'metal':[(92,111,126),(110,129,141),(128,145,153)],'linen':[(204,195,161),(224,213,178),(236,226,195)],'blue':[(93,122,155),(111,139,169),(129,154,180)],'clay':[(164,112,66),(184,130,77),(201,148,90)],'leaf':[(102,125,73),(121,143,86),(141,161,102)],'soil':[(104,78,51),(123,94,63)]}
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('assets',nargs='+');parser.add_argument('--source-job',default='vox-01');parser.add_argument('--out-job',default='vox-02');args=parser.parse_args()
for asset in args.assets:
    if not asset.replace('-','').isalnum():raise ValueError('Invalid asset ID')
    folder=BASE/asset;source,out=folder/args.source_job,folder/args.out_job
    if out.exists():
        print('PRESERVED_PALETTE',asset);continue
    data=np.load(source/'volume.npz');labels,palette=data['labels'],data['palette']
    points=np.argwhere(labels>0);rgb=palette[labels[labels>0]-1].astype(float);r,g,b=rgb.T
    material=np.full(len(rgb),'wood',dtype='<U6')
    if asset.startswith('chest'):
        material[(b>r*.85)&(g>r*.90)]='metal'
    elif asset.startswith('bed'):
        material[(g>r*.82)&(b>r*.62)]='linen'
        material[(b>r*1.05)&(b>g*1.01)]='blue'
    elif asset.startswith('planter'):
        material[:]='clay'
        center=(np.array(labels.shape[:2])-1)/2
        soil=(np.abs(points[:,0]-center[0])<=2)&(np.abs(points[:,1]-center[1])<=2)&(points[:,2]>=3)&(points[:,2]<=5)&((rgb@np.array([.2126,.7152,.0722]))<120)
        material[soil]='soil';material[(g>r*1.01)&(g>b*1.03)]='leaf'
    new_palette=[];ids=np.zeros(len(rgb),dtype=np.uint8)
    for mat in np.unique(material):
        selected=material==mat;luma=rgb[selected]@np.array([.2126,.7152,.0722]);low,high=np.min(luma),np.max(luma)
        ramp=RAMPS[mat];t=np.clip((luma-low)/max(1,high-low),0,1);bins=np.rint(t*(len(ramp)-1)).astype(int)
        offset=len(new_palette);new_palette.extend(ramp);ids[selected]=offset+bins+1
    volume=np.zeros_like(labels);volume[labels>0]=ids;assert np.array_equal(volume>0,labels>0)
    pal=np.array(new_palette,dtype=np.uint8);out.mkdir();write_vox(out/'asset.vox',volume,pal)
    decoded,decoded_pal=read_vox(out/'asset.vox');assert np.array_equal(decoded,volume) and np.array_equal(decoded_pal[:len(pal),:3],pal)
    report=json.loads((source/'report.json').read_text());pivot=report['physical_scale']['pivot_voxels'];height=report['physical_scale']['height_units'];mesh=write_glb(out/'asset.glb',volume,pal,height,pivot,asset)
    np.savez_compressed(out/'volume.npz',labels=volume,palette=pal);plan=json.loads((source/'scale-contract.json').read_text());projections(out,SimpleNamespace(pivot=pivot,shape=volume.shape),volume,pal,plan)
    report.update({'palette':pal.tolist(),'mesh':mesh,'color_method':'Explicit authored material-ramp palette correction; no albedo recovery claim','palette_correction':{'raw':'../'+args.source_job,'geometryUnchanged':True,'materials':sorted(np.unique(material).tolist()),'ramps':{m:RAMPS[m] for m in np.unique(material)},'assignment':'Manual broad hue/relative-color rules; planter soil uses explicit upper-center region. These are art choices, not inferred physical materials.','notPhysicalAlbedoRecovery':True},'art_approved':False})
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n');(out/'scale-contract.json').write_text(json.dumps(plan,indent=2)+'\n')
    print('PALETTE_COMPLETE',asset,len(pal),'colors; unchanged',int(np.count_nonzero(volume)),'cells')
