// Offline authoring only; no dependencies or artifacts enter the game bundle.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2), mode=args.shift();
function run(executable, argv, extra={}) {
 const result=spawnSync(executable,argv,{cwd:root,stdio:'inherit',windowsHide:true,...extra});
 if(result.error){console.error(result.error.message);process.exit(1);}
 process.exit(result.status??1);
}
if(mode==='compare')run(process.execPath,['tools/voxel-recipes/capture-comparison.mjs',...args]);
if(mode==='preview'){
 const [asset,job]=args;
 if(args.length!==2||![asset,job].every(v=>/^[a-zA-Z0-9-]+$/.test(v||''))){console.error('Usage: npm run voxel:preview -- <asset-folder> <job-folder>');process.exit(2);}
 if(!existsSync(path.join(root,'assets/explorations/voxel',asset,job,'report.json'))){console.error('Build that output first.');process.exit(2);}
 run(process.execPath,['tools/voxel-lab/capture.mjs'],{env:{...process.env,VOXEL_ASSET:asset,VOXEL_JOB:job}});
}
const localPython=path.join(root,'.tools','sculpt-v2-env',process.platform==='win32'?'Scripts':'bin',process.platform==='win32'?'python.exe':'python');
const python=process.env.VOXEL_PYTHON||(existsSync(localPython)?localPython:process.platform==='win32'?'python':'python3');
if(mode==='test')run(python,['-m','unittest','discover','-s','tools/voxel-recipes','-p','test_*.py','-v']);
if(mode==='build')run(python,['tools/voxel-recipes/build.py',...args]);
console.error('Usage: node scripts/voxel-recipes.mjs build|test|preview|compare …');process.exit(2);
