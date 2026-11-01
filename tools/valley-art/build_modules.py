"""Original exact-grid walk-in structures; generated images are style sources only."""
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
BASE = ROOT / 'assets/source/voxel/valley-onboarding'
sys.path.insert(0, str(AUTHORING / 'tools/trellis-vox'))
from mesh_to_vox import write_vox, read_vox, write_glb, projections, make_plan

PITCH = .0625
COLORS = {'cream':(224,213,179),'creamLight':(236,224,194),'creamWarm':(213,199,163),'stone':(171,169,149),'stoneLight':(193,187,163),'stoneWarm':(181,170,139),'wood':(154,111,64),'woodLight':(177,130,76),'woodShade':(130,92,53),'roof':(100,120,137),'roofLight':(113,132,147),'roofShade':(87,106,125),'iron':(92,106,111),'clay':(170,128,79),'clayLight':(192,149,92),'clayShade':(144,106,68),'coal':(65,61,53),'ember':(164,83,43),'floor':(181,155,111),'floorLight':(189,164,121)}
palette = list(COLORS.values())
ids = {name:i+1 for i,name in enumerate(COLORS)}

def box(a,x0,x1,y0,y1,z0,z1,color):
    a[x0:x1,y0:y1,z0:z1] = ids[color] if isinstance(color,str) else color

def merge(*arrays):
    result = np.zeros_like(arrays[0])
    for a in arrays:
        result[a>0] = a[a>0]
    return result

def export(folder,relative,volume,pivot,notes,preview=False):
    out = folder / relative
    if out.exists():
        existing=np.load(out/'volume.npz')
        if not np.array_equal(existing['labels'],volume) or not np.array_equal(existing['palette'],np.array(palette,dtype=np.uint8)):
            raise RuntimeError('Preserve differing authored module ' + str(out))
        if (out/'scale-contract.json').exists():
            return json.loads((out/'report.json').read_text())
    else:
        out.mkdir(parents=True)
    pal = np.array(palette,dtype=np.uint8)
    write_vox(out/'asset.vox',volume,pal)
    decoded,decoded_pal = read_vox(out/'asset.vox')
    assert np.array_equal(decoded,volume) and np.array_equal(decoded_pal[:len(pal),:3],pal)
    mesh = write_glb(out/'asset.glb',volume,pal,volume.shape[2]*PITCH,pivot,folder.name+'-'+relative.replace('/','-'))
    np.savez_compressed(out/'volume.npz',labels=volume,palette=pal)
    occupied=volume>0
    components,count=label(occupied)
    low=-np.array(pivot)*PITCH
    high=(np.array(volume.shape)-np.array(pivot))*PITCH
    report={'asset_id':folder.name+'-'+relative.replace('/','-'),'method':'Original authored exact native modular geometry; not inferred TRELLIS building geometry','dimensions':list(volume.shape),'grid_min':(-np.array(pivot)).tolist(),'grid_max':(np.array(volume.shape)-np.array(pivot)).tolist(),'pivot_voxels':pivot,'physical_scale':{'height_units':volume.shape[2]*PITCH,'voxel_size_units':PITCH,'pivot_voxels':pivot,'units_per_tile':1},'walking_floor':{'runtimeHeightMetres':0,'sourceVolumeTopCell':2,'pivotZCells':2,'buriedBaseMetres':.125,'supportCellsBelowFloor':int(np.count_nonzero(volume[:,:,:2]))},'occupied_voxels':int(occupied.sum()),'palette':pal.tolist(),'connected_components':int(count),'ground_cells':int(occupied[:,:,0].sum()),'mesh':mesh,'vox_roundtrip':True,'authoredNotes':notes,'style_source':{'path':'../input.png','sha256':hashlib.sha256((folder/'input.png').read_bytes()).hexdigest(),'role':'original generated appearance only; not a mesh or finished asset'},'art_approved':False,'game_integrated':False}
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    plan=make_plan({'assetId':report['asset_id'],'mode':'asset-reference','boundsUnits':{'min':low.tolist(),'max':high.tolist()},'voxelSizeUnits':PITCH,'worldUnitsPerTile':1,'logicalFootprintTiles':[int(volume.shape[0]*PITCH),int(volume.shape[1]*PITCH)],'sizeStatus':'Exact native modules with shared origin and walking-floor pivot','style':{'status':'candidate','profile':'Original warm cream-stone timber and quiet slate roof'},'cellSize':512,'paddingVoxels':8})
    (out/'scale-contract.json').write_text(json.dumps(plan,indent=2)+'\n')
    if preview:
        projections(out,SimpleNamespace(pivot=pivot,shape=volume.shape),volume,pal,plan)
    return report

def finish(asset,layers,pivot,door,source_notes):
    folder=BASE/asset
    foundation,walls,frame,roof,hearth,anvil=layers
    complete=merge(*layers)
    # Front facade includes upper front side returns, so a cutaway exposes bodies.
    shape=complete.shape
    xx,yy,zz=np.indices(shape)
    margin=8
    facade_mask=(yy<8)|((yy<shape[1]//2)&((xx<margin)|(xx>=shape[0]-margin))&(zz>=8))
    walls_frame=merge(walls,frame)
    facade=np.where(facade_mask,walls_frame,0).astype(np.uint8)
    interior=np.where(~facade_mask,walls_frame,0).astype(np.uint8)
    # Resolve overlaps in the same order as complete; parts remain disjoint.
    parts={'foundation':foundation.copy(),'interior':interior,'facade':facade,'roof':roof.copy(),'hearth':hearth.copy(),'anvil':anvil.copy()}
    owner=np.zeros(shape,dtype=np.uint8)
    order=list(parts)
    for i,name in enumerate(order,1): owner[parts[name]>0]=i
    for i,name in enumerate(order,1): parts[name][owner!=i]=0
    rebuilt=merge(*parts.values())
    assert np.array_equal(rebuilt,complete)
    cutaway=merge(*(parts[name] for name in order if name not in ('roof','facade')))
    scaffold=merge(foundation,np.where(zz<10,walls,0).astype(np.uint8),frame)
    x0,x1,y0,y1,z0,z1=door
    assert not complete[x0:x1,y0:y1,z0:z1].any(), 'Door or central working path blocked'
    full_report=export(folder,'vox-01',complete,pivot,source_notes,True)
    export(folder,'cutaway',cutaway,pivot,'Full volume minus separable roof/front facade; same grid/pivot; physical full roof remains in full source')
    export(folder,'states/foundation',foundation,pivot,'Bare level floor/foundation; visibly no walls or roof')
    export(folder,'states/scaffold',scaffold,pivot,'Foundation, partial low walls and structural timber; no completed roof or work equipment')
    part_records=[]
    for name,part in parts.items():
        if not part.any(): continue
        report=export(folder,'parts/'+name,part,pivot,'Editable separate '+name+' module; common grid/pivot')
        part_records.append({'id':name,'file':'parts/'+name+'/asset.vox','glb':'parts/'+name+'/asset.glb','hiddenInCutaway':name in ('roof','facade'),'cells':report['occupied_voxels']})
    bounds={'min':(-np.array(pivot)*PITCH).tolist(),'max':((np.array(shape)-np.array(pivot))*PITCH).tolist()}
    metadata={'id':asset,'pitch':PITCH,'unitsPerTile':1,'nativeJob':'vox-01','sourceRoute':'native-modular','gridXYZ':list(shape),'pivotVoxels':pivot,'logicalFootprint':[shape[0]*PITCH,shape[1]*PITCH],'boundsXYZMetres':bounds,'walkingFloor':{'height':0,'baseBuriedMetres':.125},'entrance':{'side':'south','clearWidth':(x1-x0)*PITCH,'clearHeight':(z1-z0)*PITCH,'clearDepth':(y1-y0)*PITCH},'models':{'full':'vox-01/asset.vox','cutaway':'cutaway/asset.vox','foundation':'states/foundation/asset.vox','scaffold':'states/scaffold/asset.vox','complete':'vox-01/asset.vox'},'parts':part_records,'physicalRoofSource':'vox-01/asset.vox; cutaway visibility must not delete physical/GI roof occupancy','provenance':source_notes,'status':'native usable-draft candidate; actual visual and lead game review pending'}
    if asset=='forge-v1': metadata['workSocketsSourceXYZ']={'hearthStand':[-.8125,.125,0],'anvilStand':[.8125,-.125,0],'anvilTop':[.8125,.375,.75]}
    else: metadata['homePadLocalXY']=[4,1]
    (folder/'parts.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print('MODULAR_NATIVE_COMPLETE',asset,json.dumps({'grid':shape,'cells':full_report['occupied_voxels'],'parts':len(part_records),'doorVerified':True}),flush=True)

def cottage():
    shape=(96,80,58);pivot=[48,40,2]
    foundation,walls,frame,roof,hearth,anvil=[np.zeros(shape,dtype=np.uint8) for _ in range(6)]
    box(foundation,0,96,0,80,0,2,'stone')
    for x in range(4,92,8): box(foundation,x,x+8,4,76,1,2,'floorLight' if (x//8)%3==0 else 'floor')
    for z in range(2,34,4):
        color=['cream','creamLight','cream','creamWarm'][((z-2)//4)%4]
        box(walls,3,6,3,77,z,min(34,z+4),color);box(walls,90,93,3,77,z,min(34,z+4),color)
        box(walls,3,93,3,6,z,min(34,z+4),color);box(walls,3,93,74,77,z,min(34,z+4),color)
    # Low stone plinth; broad material break without outlined block noise.
    box(walls,3,6,3,77,2,6,'stoneLight');box(walls,90,93,3,77,2,6,'stoneLight')
    box(walls,3,93,3,6,2,6,'stoneLight');box(walls,3,93,74,77,2,6,'stoneLight')
    for x in (3,89):
        for y in (3,73): box(frame,x,x+4,y,y+4,2,35,'wood')
    box(frame,3,93,3,7,30,34,'woodLight');box(frame,3,93,73,77,30,34,'wood')
    for x in (3,89): box(frame,x,x+4,3,77,30,34,'wood')
    # Front door is physically empty above actual floor. No threshold step.
    walls[36:60,0:8,2:30]=0
    box(frame,33,36,2,7,2,30,'wood');box(frame,60,63,2,7,2,30,'wood')
    box(frame,32,64,2,7,30,33,'woodLight')
    for x0,x1 in ((14,28),(68,82)):
        walls[x0:x1,0:8,16:27]=0;walls[x0:x1,72:80,16:27]=0
        for y0 in (2,73):
            box(frame,x0-2,x0,y0,y0+5,15,28,'wood');box(frame,x1,x1+2,y0,y0+5,15,28,'wood')
            box(frame,x0-2,x1+2,y0,y0+5,14,16,'stoneLight');box(frame,x0-2,x1+2,y0,y0+5,27,29,'woodLight')
    for x0 in (2,89):
        for y0,y1 in ((22,36),(50,64)):
            walls[x0:x0+5,y0:y1,16:27]=0
            box(frame,x0,x0+5,y0-2,y0,15,29,'wood');box(frame,x0,x0+5,y1,y1+2,15,29,'wood')
            box(frame,x0,x0+5,y0-2,y1+2,14,16,'stoneLight');box(frame,x0,x0+5,y0-2,y1+2,27,29,'woodLight')
    for x in range(96):
        z=34+int(np.ceil(22*(1-abs(x-47.5)/47.5)))
        box(roof,x,x+1,0,80,z,min(58,z+2),'roofLight' if (z//8)%3==0 else 'roof')
        if 3<=x<93:
            box(walls,x,x+1,3,6,34,z,'creamLight');box(walls,x,x+1,74,77,34,z,'cream')
            box(frame,x,x+1,2,7,max(34,z-2),z,'wood');box(frame,x,x+1,73,78,max(34,z-2),z,'wood')
    box(roof,46,50,0,80,56,58,'roofShade')
    box(frame,46,50,2,7,34,56,'wood');box(frame,46,50,73,78,34,56,'wood')
    finish('cottage-v1',[foundation,walls,frame,roof,hearth,anvil],pivot,(36,60,0,73,2,30),'Original generated cottage image is a style source only. Exact authored96x80x58 cubic-grid modules, real hollow interior,1.5m door, independent roof/facade/cutaway/foundation/scaffold. No monolithic inferred solid or external asset library.')

def forge():
    shape=(64,48,50);pivot=[32,24,2]
    foundation,walls,frame,roof,hearth,anvil=[np.zeros(shape,dtype=np.uint8) for _ in range(6)]
    box(foundation,0,64,0,48,0,2,'stoneLight')
    box(walls,3,61,43,46,2,26,'creamWarm')
    box(walls,3,6,10,46,2,14,'stoneLight');box(walls,58,61,10,46,2,14,'stoneLight')
    for x in (3,57):
        for y in (3,41): box(frame,x,x+4,y,y+4,2,35,'wood')
    box(frame,3,61,3,7,30,34,'woodLight');box(frame,3,61,41,45,30,34,'wood')
    box(frame,3,7,3,45,30,34,'wood');box(frame,57,61,3,45,30,34,'wood')
    for x in (17,43): box(frame,x,x+3,43,46,14,30,'woodShade')
    for x in range(64):
        z=34+int(np.ceil(10*(1-abs(x-31.5)/31.5)))
        box(roof,x,x+1,0,48,z,z+2,'roofLight' if (z//6)%2 else 'roof')
        if 3<=x<61:
            box(frame,x,x+1,2,7,max(32,z-2),z,'wood');box(frame,x,x+1,41,46,max(32,z-2),z,'wood')
    box(roof,30,34,0,48,44,46,'roofShade')
    # Hearth aperture and flue are actual empty cells, not painted black triangles.
    box(hearth,8,28,27,43,2,18,'clay')
    for z in (2,8,14):box(hearth,8,28,27,43,z,z+2,'clayLight')
    hearth[13:23,26:39,6:14]=0
    box(hearth,12,24,26,29,14,17,'clayLight')
    box(hearth,13,23,29,38,5,6,'coal');box(hearth,16,20,30,34,5,6,'ember')
    box(hearth,10,22,34,43,18,50,'stoneWarm');hearth[13:19,37:40,18:50]=0
    roof[10:22,34:43,:]=0
    # Reuse reviewed original local anvil; shorten only its wooden stump by4cells.
    anvil_source=AUTHORING/'assets/explorations/voxel/prop-batch-anvil-v1/vox-02'
    source=np.load(anvil_source/'volume.npz');raw=source['labels'][:,:,4:];oldpal=source['palette']
    mapping={}
    for i,color in enumerate(oldpal,1):
        rgb=tuple(int(v) for v in color)
        if rgb not in palette:palette.append(rgb)
        mapping[i]=palette.index(rgb)+1
    ap=json.loads((anvil_source/'report.json').read_text())['physical_scale']['pivot_voxels']
    for x,y,z in np.argwhere(raw>0):
        tx,ty,tz=int(x-ap[0]+46),int(y-ap[1]+31),int(z+2)
        if not(0<=tx<64 and 0<=ty<48 and 0<=tz<50):raise RuntimeError('Anvil exceeds forge native footprint')
        anvil[tx,ty,tz]=mapping[int(raw[x,y,z])]
    finish('forge-v1',[foundation,walls,frame,roof,hearth,anvil],pivot,(16,48,0,20,2,30),'Original generated forge image is a style source only. Exact64x48x50 authored native open shell/hearth/chimney and3construction states. Anvil reuses accepted local prop-batch-anvil-v1/vox-02 native geometry/RGB at identical pitch, with explicit4bottom-cell stump crop for0.75m working height. No external asset library; no paid service.')

if __name__=='__main__':
    if not (BASE/'cottage-v1/parts.json').exists():cottage()
    if not (BASE/'forge-v1/parts.json').exists():forge()
