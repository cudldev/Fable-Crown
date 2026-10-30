import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const path='public/art3d/voxel/manifest.json';
const manifest=JSON.parse(await readFile(path,'utf8'));
if(!Array.isArray(manifest.assets)||!manifest.assets.length||!Array.isArray(manifest.files))throw Error('Invalid voxel manifest');
const hash=createHash('sha256').update(JSON.stringify(manifest.assets));
const ids=new Set(),files=[];
for(const asset of manifest.assets){
 if(!/^[a-z0-9-]+$/.test(asset.id)||ids.has(asset.id)||!/^[a-z0-9-]+\.vox$/.test(asset.file)||!(asset.pitch>0)||!Array.isArray(asset.pivot)||asset.pivot.length!==3||!asset.pivot.every(Number.isFinite))throw Error('Invalid voxel asset contract');
 ids.add(asset.id);const file='art3d/voxel/'+asset.file,bytes=await readFile('public/'+file);
 if(bytes.length<20||bytes.toString('ascii',0,4)!=='VOX '||bytes.readUInt32LE(4)!==150||bytes.toString('ascii',8,12)!=='MAIN'||bytes.readUInt32LE(12)!==0||bytes.readUInt32LE(16)+20!==bytes.length)throw Error('Invalid native VOX source: '+file);
 hash.update(file).update(bytes);files.push(file);
}
const version=hash.digest('hex').slice(0,16);
if(process.argv.includes('--write'))await writeFile(path,JSON.stringify({...manifest,version,files},null,2)+'\n');
else if(manifest.version!==version||JSON.stringify(files)!==JSON.stringify(manifest.files))throw Error('Voxel manifest is stale; run node scripts/check-voxel-assets.mjs --write');
console.log(`Native voxel sources verified: ${ids.size}; version ${version}`);
