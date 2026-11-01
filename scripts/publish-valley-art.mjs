import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Explicit native source copies: preserve scale, cells, palette and pivot. No fitting.
const inventory=JSON.parse(await readFile('assets/source/voxel/valley-onboarding/inventory.json','utf8'));
const target='public/art3d/voxel/',manifest=JSON.parse(await readFile(target+'manifest.json','utf8'));
const kinds=new Set(['tent','cottage','forge','stool','table','bed','shelf','chest','planter','flowers','sapling']);
for(const asset of inventory.assets.filter(asset=>kinds.has(asset.kind))){
  const id='valley-'+asset.kind,variants=[[id,asset.models.full]];
  if(asset.models.cutaway)variants.push([id+'-cutaway',asset.models.cutaway]);
  if(asset.models.scaffold)variants.push([id+'-build',asset.models.scaffold]);
  if(asset.models.foundation)variants.push([id+'-foundation',asset.models.foundation]);
  for(const [name,source] of variants){
    const bytes=await readFile(source),file=name+'.vox';await copyFile(source,target+file);
    const spec={id:name,file,pitch:inventory.pitchMetres,pivot:asset.pivotVoxels,
      ...(name===id&&asset.models.cutaway?{depletedAsset:id+'-cutaway'}:{})};
    manifest.assets=manifest.assets.filter(entry=>entry.id!==name);manifest.assets.push(spec);
    manifest.sources[name]={source,sha256:createHash('sha256').update(bytes).digest('hex'),
      operation:'Exact native source copy; source scale and pivot preserved',review:asset.visualReviewEvidence??null};
  }
}
await writeFile(target+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Published explicit valley native bindings; run voxel source verification and bake next.');
