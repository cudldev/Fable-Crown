"""Small original connected native voxel planting models; no inference or runtime service."""
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import numpy as np
from scipy.ndimage import label

ROOT=Path(__file__).resolve().parents[2]
from _paths import authoring_root
AUTHORING=authoring_root(ROOT);BASE=ROOT/'assets/source/voxel/valley-onboarding'
sys.path.insert(0,str(AUTHORING/'tools/trellis-vox'))
from mesh_to_vox import write_vox,read_vox,write_glb,projections,make_plan
COLORS={'wood':(137,100,57),'woodLight':(153,117,67),'leaf':(102,130,61),'leafLight':(117,143,72),'leafShade':(91,119,55),'creamPetal':(235,222,181),'gold':(218,175,77),'rose':(190,127,126),'stem':(85,112,56)}
palette=np.array(list(COLORS.values()),dtype=np.uint8);ids={name:i+1 for i,name in enumerate(COLORS)}
def box(a,x0,x1,y0,y1,z0,z1,c):a[max(0,x0):min(a.shape[0],x1),max(0,y0):min(a.shape[1],y1),max(0,z0):min(a.shape[2],z1)]=ids[c]
def crown(a,cx,cy,levels):
    for z,w,d,c in levels:
        x0,y0=cx-w//2,cy-d//2
        box(a,x0,x0+w,y0+1,y0+d-1,z,z+1,c)
        box(a,x0+1,x0+w-1,y0,y0+d,z,z+1,c)

def save(name,a,pivot,notes):
    folder=BASE/name;out=folder/'vox-01'
    if out.exists():raise RuntimeError('Preserve authored vegetation')
    out.mkdir(parents=True)
    recipe={'id':name,'sourceScript':'tools/valley-art/build_landscaping.py','method':'Original authored native cells, connected stems/trunk and deliberate stepped leaf/petal masses','pitchMetres':.0625,'gridXYZ':list(a.shape),'pivotVoxels':pivot,'palette':{k:list(v) for k,v in COLORS.items()},'notes':notes}
    (folder/'recipe.json').write_text(json.dumps(recipe,indent=2)+'\n')
    brief={'id':name,'sourceRoute':'native-authored-vegetation','physicalHeightMetres':a.shape[2]*.0625,'pitchMetres':.0625,'logicalFootprintTiles':[1,1],'groundPivot':'centerXY,minZ','front':'no required facing','status':'native usable draft candidate pending actual local/lead visual review','geometrySource':'recipe.json + editable vox-01/asset.vox'}
    (folder/'brief.json').write_text(json.dumps(brief,indent=2)+'\n')
    write_vox(out/'asset.vox',a,palette);readback,colors=read_vox(out/'asset.vox');assert np.array_equal(readback,a) and np.array_equal(colors[:len(palette),:3],palette)
    mesh=write_glb(out/'asset.glb',a,palette,a.shape[2]*.0625,pivot,name);np.savez_compressed(out/'volume.npz',labels=a,palette=palette)
    _,count=label(a>0);assert count==1
    report={'asset_id':name,'method':'Original native authored vegetation; not image-reconstructed or reference-image-complete claim','dimensions':list(a.shape),'grid_min':(-np.array(pivot)).tolist(),'grid_max':(np.array(a.shape)-np.array(pivot)).tolist(),'pivot_voxels':pivot,'physical_scale':{'height_units':a.shape[2]*.0625,'voxel_size_units':.0625,'pivot_voxels':pivot,'units_per_tile':1},'occupied_voxels':int(np.count_nonzero(a)),'palette':palette.tolist(),'connected_components':count,'ground_cells':int(np.count_nonzero(a[:,:,0])),'mesh':mesh,'vox_roundtrip':True,'sourceRecipe':'../recipe.json','art_approved':False,'game_integrated':False}
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    plan=make_plan({'assetId':name,'mode':'asset-reference','boundsUnits':{'min':(-np.array(pivot)*.0625).tolist(),'max':((np.array(a.shape)-pivot)*.0625).tolist()},'voxelSizeUnits':.0625,'worldUnitsPerTile':1,'logicalFootprintTiles':[1,1],'sizeStatus':'Exact authored native size; no fit-to-fill','style':{'status':'candidate','profile':'Original quiet warm-storybook planting'},'cellSize':512,'paddingVoxels':8});(out/'scale-contract.json').write_text(json.dumps(plan,indent=2)+'\n');projections(out,SimpleNamespace(pivot=pivot,shape=a.shape),a,palette,plan)
    meta={'id':name,'pitch':.0625,'unitsPerTile':1,'nativeJob':'vox-01','sourceRoute':'native-authored-vegetation','gridXYZ':list(a.shape),'pivotVoxels':pivot,'logicalFootprint':[1,1],'models':{'full':'vox-01/asset.vox'},'parts':[{'id':'whole','file':'vox-01/asset.vox'}],'sourceRecipe':'recipe.json','provenance':notes,'status':'native usable draft candidate; lead game integration pending'}
    (folder/'parts.json').write_text(json.dumps(meta,indent=2)+'\n');print('LANDSCAPING_NATIVE',name,report['occupied_voxels'],a.shape,pivot)

flowers=np.zeros((12,12,8),dtype=np.uint8)
for x0,x1,y0,y1 in [(3,8,4,6),(6,9,5,10),(1,5,8,10),(3,7,7,9)]:box(flowers,x0,x1,y0,y1,0,2,'leaf')
for cx,cy,z,petal in [(4,4,5,'creamPetal'),(8,7,7,'creamPetal'),(3,9,4,'rose')]:
    box(flowers,cx-1,cx+1,cy-1,cy+1,1,z+1,'stem')
    box(flowers,cx-2,cx+3,cy-1,cy+2,z,z+1,petal);box(flowers,cx-1,cx+2,cy-2,cy+3,z,z+1,petal)
    box(flowers,cx,cx+1,cy,cy+1,z,z+1,'gold')
box(flowers,6,8,9,11,1,3,'leafLight')
save('flowers-v1',flowers,[6,6,0],'Three original low cream/gold/rose blossoms on connected stepped sage leaves/stems. Declared native extent0.75x0.75x0.5m, logical1x1m; original editable cell source, no paid/inference stage.')
sapling=np.zeros((16,16,22),dtype=np.uint8)
box(sapling,6,10,7,9,0,2,'wood');box(sapling,7,9,6,10,0,1,'wood')
box(sapling,7,9,7,9,1,20,'woodLight');box(sapling,4,8,7,9,9,11,'wood');box(sapling,4,6,7,9,10,15,'woodLight');box(sapling,8,12,7,9,11,13,'wood');box(sapling,10,12,7,9,12,17,'woodLight')
crown(sapling,4,8,[(10,3,4,'leafShade'),(11,5,6,'leaf'),(12,7,6,'leaf'),(13,6,5,'leafLight'),(14,4,3,'leafLight')])
crown(sapling,9,9,[(14,7,7,'leafShade'),(15,9,9,'leaf'),(16,9,9,'leaf'),(17,7,8,'leafLight'),(18,7,7,'leaf'),(19,5,6,'leafLight'),(20,3,4,'leafLight'),(21,3,3,'leaf')])
crown(sapling,8,12,[(12,3,3,'leafShade'),(13,5,5,'leaf'),(14,6,5,'leaf'),(15,4,4,'leafLight'),(16,3,3,'leafLight')])
save('sapling-v1',sapling,[8,8,0],'Original small asymmetric forked sapling: rooted trunk, two stout branch directions, dominant stepped crown and supporting left/rear lobes. Native extent1x1x1.375m; logical1x1m, shared pitch. Quiet broad olive pigment groups; no reused proprietary tree.')
