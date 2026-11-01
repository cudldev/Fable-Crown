"""Read-only geometry/source audit; writes one local evidence report."""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image
import trimesh

ROOT=Path(__file__).resolve().parents[2]
from _paths import authoring_root
AUTHORING=authoring_root(ROOT);BASE=ROOT/'assets/source/voxel/valley-onboarding'
sys.path.insert(0,str(AUTHORING/'tools/trellis-vox'))
from mesh_to_vox import read_vox
inventory=json.loads((BASE/'inventory.json').read_text());assert not inventory['pending']
results=[];variants=0;unique_models=set();part_count=0
for asset in inventory['assets']:
    native=ROOT/asset['nativeVoxel'];volume,palette=read_vox(native);report=json.loads((ROOT/asset['nativeReport']).read_text());pivot=np.array(asset['pivotVoxels']);pitch=.0625
    assert list(volume.shape)==asset['gridXYZ']==report['dimensions']
    assert int(np.count_nonzero(volume))==asset['occupiedCells']==report['occupied_voxels']
    assert int(volume.max())<=len(report['palette'])
    assert np.array_equal(palette[:len(report['palette']),:3],np.array(report['palette'],dtype=np.uint8))
    assert hashlib.sha256(native.read_bytes()).hexdigest()==asset['nativeSha256']
    assert report['physical_scale']['voxel_size_units']==pitch
    assert np.count_nonzero(volume[:,:,0])>0
    # Independent CPU GLB loader bounds from actual occupied cube corners.
    points=np.argwhere(volume>0);low=(points.min(axis=0)-pivot)*pitch;high=(points.max(axis=0)+1-pivot)*pitch
    expected=np.array([[low[0],low[2],-high[1]],[high[0],high[2],-low[1]]])
    glb=trimesh.load(ROOT/asset['nativeGLB'],force='scene');assert np.allclose(glb.bounds,expected,atol=1e-6)
    for state,file in asset['models'].items():
        other,colors=read_vox(ROOT/file);assert other.shape==volume.shape
        assert not ((other>0)&(volume==0)).any(), (asset['kind'],state,'state adds unsupported occupancy')
        variants+=1
        unique_models.add(file)
    if asset['partsMetadata']:
        parts=json.loads((ROOT/asset['partsMetadata']).read_text());rebuilt=np.zeros_like(volume)
        if asset['kind'] in ('cottage','forge'):
            for part in parts['parts']:
                cells,_=read_vox(ROOT/asset['sourceDirectory']/part['file']);assert cells.shape==volume.shape
                assert not ((rebuilt>0)&(cells>0)).any(), 'Part groups overlap'
                rebuilt[cells>0]=cells[cells>0]
                part_count+=1
            assert np.array_equal(rebuilt,volume)
    if asset['kind']=='tent':assert not volume[12:36,0:38,2:26].any()
    elif asset['kind']=='cottage':assert not volume[36:60,0:73,2:30].any()
    elif asset['kind']=='forge':assert not volume[16:48,0:20,2:30].any()
    elif asset['kind']=='shelf':assert not volume[5:19,:,3:6].any() and not volume[5:19,:,9:12].any()
    source_image=asset.get('sourceImage');edge_alpha=None
    if source_image:
        image=Image.open(ROOT/source_image).convert('RGBA');alpha=np.array(image)[:,:,3]
        edge_alpha=int(max(alpha[0,:].max(),alpha[-1,:].max(),alpha[:,0].max(),alpha[:,-1].max()))
        # Built-in PNGs retain imperceptible1/255 alpha at some outer pixels.
        # Require fully clear material bounds; preserve/report raw source rather than edit it.
        assert edge_alpha<=1, (asset['id'],'Visible material touches source boundary',edge_alpha)
        if asset.get('generationMetadata'):
            generation=json.loads((ROOT/asset['generationMetadata']).read_text());assert generation['input_sha256']==hashlib.sha256((ROOT/source_image).read_bytes()).hexdigest()
    correction=report.get('palette_correction')
    if correction:
        raw=ROOT/asset['sourceDirectory']/asset['selectedJob']/correction['raw']/'volume.npz';before=np.load(raw)['labels'];assert np.array_equal(before>0,volume>0)
    results.append({'kind':asset['kind'],'grid':list(volume.shape),'pivot':pivot.tolist(),'cells':asset['occupiedCells'],'nativeReadback':True,'independentGlbBounds':True,'sourceHashAlpha':True,'sourceEdgeAlphaMaxOf255':edge_alpha,'modelStatesSameGridSubset':True,'palettePassGeometryPreserved':bool(correction),'visualEvidence':asset['visualReviewEvidence']})
body=Image.open(BASE/'pixel-actions-v1/body-unchanged.png').convert('RGBA');assert body.getbbox()==(7,10,24,28)
shield=Image.open(BASE/'pixel-actions-v1/shield-native.png').convert('RGBA');assert shield.size==(8,10) and shield.getbbox()==(0,0,8,10)
recipe=json.loads((BASE/'pixel-actions-v1/recipe.json').read_text())
for tool in recipe['tools'].values():
    for frame in tool['frames'].values():
        assert all(0<=p['x']<32 and 0<=p['y']<32 for p in frame['toolCells'])
        a=np.array(Image.open(BASE/'pixel-actions-v1'/frame['nativeToolPNG']).convert('RGBA'))[:,:,3];assert set(np.unique(a)).issubset({0,255})
evidence={'assetCount':len(results),'modelBindingsChecked':variants,'uniqueModelFilesChecked':len(unique_models),'editableBuildingPartFilesChecked':part_count,'results':results,'pixelRecipeTools':len(recipe['tools']),'pixelBodyUnchangedBounds':[7,10,24,28],'shieldNativeCells':[8,10],'converterTests':{'count':5,'result':'passed','command':'python -m unittest discover -s tools/trellis-vox -p test_*.py -v','scope':'Existing converter scale/ground/color,minority palette,open cavity,repeatability/translation andwide export gates; actual run2026-11-01'},'staticRuntimeReview':'in-game-review.json','allPassed':True,'scope':'11selected native source assets,20model/state bindings(18unique files),12editable building parts and7pixel recipe tools, plus separately documented static in-game appearance. Does not establish timed construction transitions, animation playback, save/gameplay correctness, GPU/phone performance, native MagicaVoxel app compatibility, user final art approval or public deployment. Lead owns runtime tests/build/release.'}
(BASE/'native-audit.json').write_text(json.dumps(evidence,indent=2)+'\n');print(json.dumps({'allPassed':True,'assets':len(results),'variants':variants,'pixelTools':len(recipe['tools'])}))
