const fs=require('fs'),path=require('path'),vm=require('vm'),sharp=require('C:/Users/antto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');const root=path.resolve(__dirname,'../../..');
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

const specs=[
['se','cut,mine','se-cut-mine-proof',400,[250,750,1260],[480,975]],
['se','fish,smith','se-fish-smith-corrected',350,[240,760,1280],[465,945]],
['se','cook,melee','se-cook-melee-corrected',390,[245,760,1270],[485,965]],
['se','bow','se-bow',560,[320,1090,1810],[665]],
['nw','cut,mine','nw-cut-mine',380,[180,740,1280],[490,1000]],
['nw','fish,smith','nw-fish-smith',390,[180,740,1300],[490,995]],
['nw','cook,melee','nw-cook-melee',390,[180,740,1280],[490,995]],
['nw','bow','nw-bow-corrected',460,[400,1090,1870],[650]],
];
(async()=>{const frames={},proof=[];for(const [dir,actionText,name,bodyHeight,pivotXs,grounds] of specs){const actions=actionText.split(','),{data,info}=await sharp(path.join(__dirname,'work-'+name+'-original.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});const {labels,figures}=isolate(data,info.width,info.height);if(figures.length!==actions.length*3)throw Error(name+' figures '+figures.length);let ordered=[];for(let row=0;row<actions.length;row++){let list=figures.filter(g=>(g.y0+g.y1)/2>=row*info.height/actions.length&&(g.y0+g.y1)/2<(row+1)*info.height/actions.length).sort((a,b)=>(a.x0+a.x1)-(b.x0+b.x1));if(list.length!==3)throw Error(name+' row '+row);ordered.push(...list)}const cw=Math.max(...ordered.map(g=>g.x1-g.x0+1))+64,ch=Math.max(...ordered.map(g=>g.y1-g.y0+1))+64,comps=[];for(let i=0;i<ordered.length;i++){let g=ordered[i],w=g.x1-g.x0+1,h=g.y1-g.y0+1,pixels=Buffer.alloc(w*h*4);for(let y=g.y0;y<=g.y1;y++)for(let x=g.x0;x<=g.x1;x++){let src=y*info.width+x;if(labels[src]===g.label)data.copy(pixels,((y-g.y0)*w+x-g.x0)*4,src*4,src*4+4)}let ox=Math.floor((cw-w)/2),oy=ch-h-32,px=pivotXs[i%3]-g.x0+ox,py=grounds[Math.floor(i/3)]-g.y0+oy;if(px<0||px>=cw||py<0||py>=ch)throw Error(name+' pivot '+i);let frame={sheet:'prince-v5-work-'+name,x:i%3*cw,y:Math.floor(i/3)*ch,width:cw,height:ch,pivotX:px,pivotY:py,boundsWidth:w,boundsHeight:h,bodyHeight};let key=dir+':'+actions[Math.floor(i/3)]+':'+['prepare','contact','recover'][i%3];frames[key]=frame;const png=await sharp(pixels,{raw:{width:w,height:h,channels:4}}).png().toBuffer();comps.push({input:png,left:i%3*cw+ox,top:Math.floor(i/3)*ch+oy});let scale=90/bodyHeight,thumb=await sharp(png).resize(Math.round(w*scale),Math.round(h*scale)).png().toBuffer(),top=150-Math.round((grounds[Math.floor(i/3)]-g.y0)*scale),left=100-Math.round((pivotXs[i%3]-g.x0)*scale);let tile=await sharp({create:{width:200,height:180,channels:4,background:'#d9c6a3'}}).composite([{input:thumb,left,top}]).png().toBuffer();proof.push({input:tile,left:i%3*200,top:(proof.length/3|0)*180});}await sharp({create:{width:cw*3,height:ch*actions.length,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(comps).webp({quality:85,alphaQuality:100}).toFile(path.join(root,'public/art','prince-v5-work-'+name+'.webp'));}
for(const [target,source] of [['sw','se'],['ne','nw']])for(const [key,value] of Object.entries({...frames}))if(key.startsWith(source+':'))frames[target+key.slice(source.length)]={...value,flipX:true};fs.writeFileSync(path.join(__dirname,'work-atlas-metadata.json'),JSON.stringify(frames,null,2)+'\n');const ts=require(path.join(root,'node_modules/typescript')),p=path.join(root,'src/render/actor-atlas.ts'),source=fs.readFileSync(p,'utf8'),js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,ctx={exports:{}};vm.runInNewContext(js,ctx);fs.writeFileSync(p,source.slice(0,source.indexOf('export const actorAtlas'))+'export const actorAtlas: Record<string, ActorAtlasFrame> = '+JSON.stringify({...ctx.exports.actorAtlas,...frames},null,2)+';\n');await sharp({create:{width:600,height:proof.length/3*180,channels:4,background:'#d9c6a3'}}).composite(proof).png().toFile(path.join(__dirname,'work-gameplay-proof.png'));console.log(Object.keys(frames).length+' work keys');require('./work-cook-build.cjs');})();
