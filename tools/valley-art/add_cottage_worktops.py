"""Preserved cottage revision with personal bench and planning table at wall sockets."""
import json
from pathlib import Path
import numpy as np
from build_modules import export,merge,box

ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets/source/voxel/valley-onboarding/cottage-v1'
data=np.load(BASE/'vox-01/volume.npz');original=data['labels'];old_cut=np.load(BASE/'cutaway/volume.npz')['labels']
bench,planning=[np.zeros_like(original) for _ in range(2)]
for a,x0,x1 in ((bench,6,14),(planning,82,90)):
    box(a,x0,x1,18,30,12,14,'woodLight')
    for x in (x0+1,x1-3):
        for y in (19,27):box(a,x,x+2,y,y+2,2,12,'wood')
    box(a,x0+1,x1-1,19,21,6,8,'wood')
# Two quiet metal stops distinguish the personal craft bench.
box(bench,7,9,19,21,13,14,'iron');box(bench,11,13,27,29,13,14,'iron')
# A flush parchment/map pigment area distinguishes the planning surface; no extra height.
box(planning,83,89,20,28,13,14,'creamLight');box(planning,85,87,21,27,13,14,'woodLight')
full,cutaway=merge(original,bench,planning),merge(old_cut,bench,planning)
assert not full[36:60,0:73,2:30].any()
pivot=[48,40,2]
export(BASE,'vox-02',full,pivot,'Preserved native cottage-v1/vox-01 plus two exact wall-socket worktops; original revision retained. Both counter surfaces are0.75m above walking floor.')
export(BASE,'cutaway-v2',cutaway,pivot,'Preserved cutaway plus both worktops; shared grid/pivot; full physical roof stays in vox-02.')
export(BASE,'parts/workbench',bench,pivot,'Personal workbench; sourceX6:14,Y18:30,Z2:14; flushinside west wall. Two subtle metal stops,0.75m working top.')
export(BASE,'parts/planning-table',planning,pivot,'Planning table; sourceX82:90,Y18:30,Z2:14; flushinside east wall. Flush cream map pigment,0.75m working top.')
old=(BASE/'parts.json').read_bytes();prior=BASE/'parts-v1.json'
if not prior.exists():prior.write_bytes(old)
meta=json.loads(old);meta['nativeJob']='vox-02';meta['models'].update({'full':'vox-02/asset.vox','complete':'vox-02/asset.vox','cutaway':'cutaway-v2/asset.vox'});meta['physicalRoofSource']='vox-02/asset.vox; cutaway remains a visibility variant only'
for name in ('workbench','planning-table'):meta['parts'].append({'id':name,'file':'parts/'+name+'/asset.vox','glb':'parts/'+name+'/asset.glb','hiddenInCutaway':False,'cells':int(np.count_nonzero(bench if name=='workbench' else planning))})
meta['workstations']=[{'id':'personal-workbench','homePadTileCenter':[4,2],'sourceCenterVoxel':[10,24,2],'surfaceHeightMetres':.75,'counterSizeSourceXYZMetres':[.5,.75,.75],'sourceBoundsMetres':{'min':[-2.625,-1.375,0],'max':[-2.125,-.625,.75]},'accessFrom':'east/room centre'},{'id':'planning-table','homePadTileCenter':[9,2],'sourceCenterVoxel':[86,24,2],'surfaceHeightMetres':.75,'counterSizeSourceXYZMetres':[.5,.75,.75],'sourceBoundsMetres':{'min':[2.125,-1.375,0],'max':[2.625,-.625,.75]},'accessFrom':'west/room centre'}]
meta['revisionNote']='vox-01/cutaway and parts-v1.json preserved. vox-02/cutaway-v2 add only wall-socket worktops; central south entrance/passage remains empty.'
(BASE/'parts.json').write_text(json.dumps(meta,indent=2)+'\n');print('COTTAGE_WORKTOPS',int(np.count_nonzero(full)),int(np.count_nonzero(cutaway)))
