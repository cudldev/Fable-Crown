import {readFile,writeFile} from 'node:fs/promises';
const source='assets/source/voxel/valley-onboarding/pixel-actions-v1/recipe.json';
const recipe=JSON.parse(await readFile(source,'utf8')),result={};
for(const [tool,spec] of Object.entries(recipe.tools)){
  result[tool]={};
  for(const [pose,frame] of Object.entries(spec.frames)){
    result[tool][frame.atlasFrame]={grip:frame.gripTopLeft,cells:frame.toolCells.map(cell=>[cell.x,cell.y,...recipe.paletteRGB[cell.pigment]])};
  }
}
await writeFile('src/render/held-action-data.ts','// Original native pixel poses, generated from '+source+'.\n'+
  'export const HELD_ACTIONS:Record<string,Record<number,{grip:number[];cells:number[][]}>> = '+JSON.stringify(result)+';\n');
console.log('Published authored held-tool strike and shield cells, preserving the shared source grid.');
