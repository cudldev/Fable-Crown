// Mechanical source isolation/packing only. Image generation is built-in ImageGen.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('C:/Users/antto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(__dirname, '../../..');
const poses = ['idle','walk:0','walk:1','walk:2','walk:3','run:0','run:1','run:2','run:3'];
function isolate(data,w,h) {
  const labels=new Int32Array(w*h),groups=[];
  for(let start=0;start<labels.length;start++) {
    if(labels[start]||data[start*4+3]<32)continue;
    const label=groups.length+1,pending=[start];labels[start]=label;
    let x0=w,y0=h,x1=0,y1=0,count=0;
    while(pending.length){const i=pending.pop(),x=i%w,y=Math.floor(i/w);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for(const j of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1])if(j>=0&&!labels[j]&&data[j*4+3]>=32){labels[j]=label;pending.push(j);}}
    groups.push({label,x0,y0,x1,y1,count});
  }
  const figures=groups.filter(g=>g.count>1000),valid=new Set(figures.map(g=>g.label)),queue=[];
  for(let i=0;i<labels.length;i++){if(valid.has(labels[i]))queue.push(i);else labels[i]=0;}
  for(let cursor=0;cursor<queue.length;cursor++){const i=queue[cursor],x=i%w,y=Math.floor(i/w);
    for(const j of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1])if(j>=0&&!labels[j]&&data[j*4+3]){labels[j]=labels[i];queue.push(j);}}
  for(const g of figures){g.x0=w;g.y0=h;g.x1=0;g.y1=0;}
  const by=new Map(figures.map(g=>[g.label,g]));
  for(let i=0;i<labels.length;i++){const g=by.get(labels[i]);if(g){const x=i%w,y=Math.floor(i/w);g.x0=Math.min(g.x0,x);g.x1=Math.max(g.x1,x);g.y0=Math.min(g.y0,y);g.y1=Math.max(g.y1,y);}}
  return {labels,figures};
}
async function build(spec) {
  let input=sharp(path.join(__dirname,spec.file)); if(spec.crop) input=input.extract(spec.crop);
  const {data,info}=await input.ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(process.argv.includes('--diagnose')) { let edge=0; for(let x=0;x<info.width;x++) edge+=+(data[x*4+3]>0)+ +(data[((info.height-1)*info.width+x)*4+3]>0); for(let y=0;y<info.height;y++) edge+=+(data[y*info.width*4+3]>0)+ +(data[(y*info.width+info.width-1)*4+3]>0); console.log(spec.direction,'edge pixels',edge); }
  const {labels,figures}=isolate(data,info.width,info.height);
  if(process.argv.includes('--diagnose')) console.log(spec.direction,figures.map(g=>[g.x0,g.y0,g.x1,g.y1,g.count]));
  if(process.argv.includes('--diagnose')) return {};
  if(figures.length!==9)throw Error(`${spec.direction}: expected 9 isolated figures, got ${figures.length}`);
  const ordered=poses.map((_,i)=>figures.find(g=>Math.floor((g.x0+g.x1)/2/info.width*3)===i%3&&Math.floor((g.y0+g.y1)/2/info.height*3)===Math.floor(i/3)));
  if(ordered.some(g=>!g))throw Error(`${spec.direction}: invalid row/column assignment`);
  const cellWidth=Math.max(...ordered.map(g=>g.x1-g.x0+1))+32;
  const cellHeight=Math.max(...ordered.map(g=>g.y1-g.y0+1))+32;
  const frames={},composites=[],proofs=[],cycle=[];
  for(let i=0;i<9;i++){
    const g=ordered[i],width=g.x1-g.x0+1,height=g.y1-g.y0+1,pixels=Buffer.alloc(width*height*4);
    for(let y=g.y0;y<=g.y1;y++)for(let x=g.x0;x<=g.x1;x++){const src=y*info.width+x;if(labels[src]===g.label)data.copy(pixels,((y-g.y0)*width+x-g.x0)*4,src*4,src*4+4);}
    const insetX=Math.floor((cellWidth-width)/2),insetY=cellHeight-height-16;
    const pivotX=spec.pivots[i][0]-g.x0+insetX,pivotY=spec.pivots[i][1]-g.y0+insetY;
    // Pivot may lie just below airborne boots, but must remain in padded cell.
    if(pivotX<0||pivotX>=cellWidth||pivotY<0||pivotY>=cellHeight)throw Error(`${spec.direction}:${poses[i]} pivot outside padded cell`);
    frames[`${spec.direction}:${poses[i]}`]={sheet:`prince-v5-${spec.direction}`,x:i%3*cellWidth,y:Math.floor(i/3)*cellHeight,width:cellWidth,height:cellHeight,pivotX,pivotY,boundsWidth:width,boundsHeight:height,bodyHeight:spec.bodyHeight};
    const png=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
    composites.push({input:png,left:i%3*cellWidth+insetX,top:Math.floor(i/3)*cellHeight+insetY});
    const scale=90/spec.bodyHeight,thumb=await sharp(png).resize(Math.round(width*scale),Math.round(height*scale)).png().toBuffer();
    const groundX=Math.round((spec.pivots[i][0]-g.x0)*scale),groundY=Math.round((spec.pivots[i][1]-g.y0)*scale);
    const proof=await sharp({create:{width:150,height:150,channels:4,background:'#d9c6a3'}}).composite([{input:thumb,left:75-groundX,top:125-groundY}]).png().toBuffer();
    proofs.push({input:proof,left:i%3*150,top:Math.floor(i/3)*150});cycle.push(proof);
  }
  await sharp({create:{width:cellWidth*3,height:cellHeight*3,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composites).webp({quality:95,alphaQuality:100}).toFile(path.join(root,'public/art',`prince-v5-${spec.direction}.webp`));
  await sharp({create:{width:450,height:450,channels:4,background:'#d9c6a3'}}).composite(proofs).png().toFile(path.join(__dirname,`${spec.direction}-gameplay-proof.png`));
  for(const [mode,start,delay] of [['walk',1,180],['run',5,110]]){
    const pages=[];for(let i=start;i<start+4;i++)pages.push(await sharp(cycle[i]).ensureAlpha().raw().toBuffer());
    await sharp(Buffer.concat(pages),{raw:{width:150,height:600,channels:4,pageHeight:150}}).gif({loop:0,delay:[delay,delay,delay,delay]}).toFile(path.join(__dirname,`${spec.direction}-${mode}-proof.gif`));
  }
  return frames;
}
(async()=>{
  const specs=JSON.parse(fs.readFileSync(path.join(__dirname,'sources.json'),'utf8')),frames={};
  for(const spec of specs.filter(s=>!s.mirrorOf))Object.assign(frames,await build(spec));
  for(const spec of specs.filter(s=>s.mirrorOf)) for(const pose of poses) {
    const source=frames[`${spec.mirrorOf}:${pose}`];
    if(!source) throw Error(`Missing mirror source ${spec.mirrorOf}:${pose}`);
    frames[`${spec.direction}:${pose}`]={...source,flipX:true};
  }
  if(process.argv.includes('--diagnose')) return;
  fs.writeFileSync(path.join(__dirname,'atlas-metadata.json'),JSON.stringify(frames,null,2)+'\n');
  if(process.argv.includes('--integrate')){
    const ts=require(path.join(root,'node_modules/typescript'));
    const source=fs.readFileSync(path.join(root,'src/render/actor-atlas.ts'),'utf8');
    const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
    const context={exports:{}};vm.runInNewContext(js,context);
    const merged={...context.exports.actorAtlas,...frames};
    const header=source.slice(0,source.indexOf('export const actorAtlas'));
    fs.writeFileSync(path.join(root,'src/render/actor-atlas.ts'),header+'export const actorAtlas: Record<string, ActorAtlasFrame> = '+JSON.stringify(merged,null,2)+';\n');
  }
  console.log(`Prepared ${Object.keys(frames).length} V5 frames; integration=${process.argv.includes('--integrate')}`);
})();



