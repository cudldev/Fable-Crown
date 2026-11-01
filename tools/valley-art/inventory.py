"""Write lead-owned integration input from completed source artifacts only."""
import hashlib
import json
from pathlib import Path
import math

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets/source/voxel/valley-onboarding'
selected={'tent':'tent-v2','cottage':'cottage-v1','forge':'forge-v1','stool':'stool-v1','table':'table-v1','bed':'bed-v1','shelf':'shelf-v1','chest':'chest-v1','planter':'planter-v1','flowers':'flowers-v1','sapling':'sapling-v1'}
inventory={'schemaVersion':1,'sourceRoot':'assets/source/voxel/valley-onboarding','pitchMetres':.0625,'unitsPerTile':1,'sourceAxes':'X width,Y depth,Z up; front-Y','runtimeAxes':'X width,Y up,Z=-sourceY; front+Z','actorBodyMetres':{'width':1.0625,'height':1.125},'integrationOwnership':'Lead only: runtime/public manifest/renderers/bakes untouched by art specialist','pixelActionRecipe':'assets/source/voxel/valley-onboarding/pixel-actions-v1/recipe.json','pixelActionPreview':'assets/source/voxel/valley-onboarding/pixel-actions-v1/pose-review.png','assets':[],'pending':[]}
game_review=json.loads((BASE/'in-game-review.json').read_text()) if (BASE/'in-game-review.json').exists() else None
if game_review:
    inventory['staticInGameReview']='assets/source/voxel/valley-onboarding/in-game-review.json'
    if game_review.get('pixelRuntimeAppearance'):
        inventory['pixelRuntimeAppearanceReview']='assets/source/voxel/valley-onboarding/in-game-review.json'
for kind,name in selected.items():
    folder=BASE/name;brief=json.loads((folder/'brief.json').read_text());parts=json.loads((folder/'parts.json').read_text()) if (folder/'parts.json').exists() else None
    job=parts['nativeJob'] if parts else 'vox-02'
    report_path=folder/job/'report.json'
    if not report_path.exists():
        inventory['pending'].append({'kind':kind,'directory':folder.relative_to(ROOT).as_posix(),'awaiting':'selected native '+job+' plus actual visual review'});continue
    report=json.loads(report_path.read_text());native=folder/job/'asset.vox';prefix=folder.relative_to(ROOT).as_posix();review=folder/('review-'+job)/'browser-review.json'
    model_paths={key:prefix+'/'+value for key,value in parts.get('models',{}).items()} if parts else {'full':prefix+'/'+job+'/asset.vox'}
    if not model_paths:model_paths={'full':prefix+'/'+job+'/asset.vox'}
    record={'kind':kind,'id':name,'sourceDirectory':prefix,'sourceImage':prefix+'/input.png','sourcePrompt':prefix+'/input.prompt.txt','physicalBrief':prefix+'/brief.json','sourceRoute':brief.get('sourceRoute','single colored image -> pinned local TRELLIS -> native VOX'),'selectedJob':job,'nativeVoxel':native.relative_to(ROOT).as_posix(),'nativeSha256':hashlib.sha256(native.read_bytes()).hexdigest(),'nativeGLB':prefix+'/'+job+'/asset.glb','nativeReport':report_path.relative_to(ROOT).as_posix(),'scaleContract':prefix+'/'+job+'/scale-contract.json','gridXYZ':report['dimensions'],'pivotVoxels':report['physical_scale']['pivot_voxels'],'extentXYZMetres':[v*.0625 for v in report['dimensions']],'heightAbovePivotMetres':(report['dimensions'][2]-report['physical_scale']['pivot_voxels'][2])*.0625,'walkingFloorMetres':0,'occupiedCells':report['occupied_voxels'],'paletteEntries':len(report['palette']),'models':model_paths,'partsMetadata':prefix+'/parts.json' if parts else None,'partGroups':parts.get('parts',[]) if parts else [{'id':'whole','file':job+'/asset.vox'}],'visualReviewEvidence':review.relative_to(ROOT).as_posix() if review.exists() else None,'preview':prefix+'/review-'+job+'/vox-iso.png' if review.exists() else None,'specialistVisualStatus':'usable draft candidate' if review.exists() else 'native complete; visual review pending','runtimeGameReviewed':False,'artApproved':False}
    if brief.get('sourceRoute','').startswith('native-'):
        if not (folder/'input.png').exists():record['sourceImage']=None;record['sourcePrompt']=None
        if (folder/'recipe.json').exists():record['sourceRecipe']=prefix+'/recipe.json'
    else:record.update({'rawLearnedMesh':prefix+'/trellis-01/raw-mesh.npz','generationMetadata':prefix+'/trellis-01/generation.json'})
    if (folder/'art-review.json').exists() and not review.exists():record['visualReviewEvidence']=prefix+'/art-review.json';record['specialistVisualStatus']='usable draft candidate';record['preview']=prefix+'/'+job+'/software-iso.png'
    if kind=='table':record['suggestedQuarterTurns']=1;record['footprintNote']='Native long axis is sourceY;90degree rotation gives2m width and1.125m depth. Keep measured overhang; no per-axis fit.'
    if kind=='bed':record['footprintNote']='Selected mesh uniformly reconverted at0.75m total headboard height; original1m variant preserved. Expected~1.25x1.875m measured footprint; no axis stretch.'
    if kind in ('tent','cottage','forge'):record['buriedBaseMetres']=.125
    if game_review and kind in game_review['assets']:record['runtimeGameReviewed']=True;record['runtimeReviewScope']='Static complete/cutaway appearance in supplied desktop and phone captures; no performance/deployment/user-final-art claim'
    inventory['assets'].append(record)
(BASE/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
print(json.dumps({'nativeAssets':[a['kind'] for a in inventory['assets']],'pending':[a['kind'] for a in inventory['pending']]}))
