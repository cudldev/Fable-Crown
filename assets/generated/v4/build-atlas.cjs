const fs = require('node:fs');
const path = require('node:path');
const sharp = require('C:/Users/antto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(__dirname, '../../..');
const facings = ['ne', 'se', 'sw', 'nw'];
function components(data, width, height) {
  const labels = new Int32Array(width * height); const groups = [];
  for (let start=0; start<labels.length; start++) {
    if (labels[start] || data[start*4+3]<32) continue;
    const label=groups.length+1, pending=[start]; labels[start]=label;
    let x0=width,y0=height,x1=0,y1=0,count=0;
    while(pending.length) {
      const index=pending.pop(),x=index%width,y=Math.floor(index/width); count++;
      x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for(const next of [x>0?index-1:-1,x<width-1?index+1:-1,y>0?index-width:-1,y<height-1?index+width:-1]) {
        if(next>=0&&!labels[next]&&data[next*4+3]>=32){labels[next]=label;pending.push(next);}
      }
    }
    groups.push({label,x0,y0,x1,y1,count});
  }
  const figures=groups.filter(group=>group.count>100),valid=new Set(figures.map(group=>group.label)),queue=[];
  for(let i=0;i<labels.length;i++){if(valid.has(labels[i]))queue.push(i);else labels[i]=0;}
  for(let cursor=0;cursor<queue.length;cursor++) {
    const index=queue[cursor],x=index%width,y=Math.floor(index/width);
    for(const next of [x>0?index-1:-1,x<width-1?index+1:-1,y>0?index-width:-1,y<height-1?index+width:-1])
      if(next>=0&&!labels[next]&&data[next*4+3]){labels[next]=labels[index];queue.push(next);}
  }
  for(const group of figures){group.x0=width;group.y0=height;group.x1=0;group.y1=0;}
  const byLabel=new Map(figures.map(group=>[group.label,group]));
  for(let i=0;i<labels.length;i++){const group=byLabel.get(labels[i]);if(group){const x=i%width,y=Math.floor(i/width);group.x0=Math.min(group.x0,x);group.x1=Math.max(group.x1,x);group.y0=Math.min(group.y0,y);group.y1=Math.max(group.y1,y);}}
  return {labels,groups:figures};
}
async function build(stem, poses) {
  const source = path.join(__dirname, `${stem}-original.png`);
  const meta = await sharp(source).metadata();
  const pixels=await sharp(source).ensureAlpha().raw().toBuffer();
  let isolated=components(pixels,meta.width,meta.height);
  if(stem==='prince-locomotion') {
    const labels=new Int32Array(meta.width*meta.height),groups=[];
    for(let row=0;row<4;row++)for(let col=0;col<4;col++) {
      const label=row*4+col+1,x0=Math.floor(col*meta.width/4),x1=Math.floor((col+1)*meta.width/4)-1,
        y0=Math.floor(row*meta.height/4),y1=Math.floor((row+1)*meta.height/4)-1;
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)labels[y*meta.width+x]=label;
      groups.push({label,x0,x1,y0,y1});
    }
    isolated={labels,groups};
  }
  if(isolated.groups.length!==poses.length*4)throw new Error(`${stem}: expected ${poses.length*4} isolated figures, got ${isolated.groups.length}`);
  const cellWidth = Math.max(...isolated.groups.map(group=>group.x1-group.x0+1))+24;
  const cellHeight = Math.max(...isolated.groups.map(group=>group.y1-group.y0+1))+24;
  const frames = {}; const composites = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < poses.length; col++) {
    const group=isolated.groups.find(group=>Math.floor((group.x0+group.x1)/2/meta.width*poses.length)===col&&Math.floor((group.y0+group.y1)/2/meta.height*4)===row);
    if(!group)throw new Error(`Missing figure ${row}:${col}`);
    const width=group.x1-group.x0+1,height=group.y1-group.y0+1;
    const cropped=Buffer.alloc(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const original=(y+group.y0)*meta.width+x+group.x0;
      if(isolated.labels[original]===group.label)pixels.copy(cropped,(y*width+x)*4,original*4,original*4+4);
    }
    const insetX=Math.floor((cellWidth-width)/2),insetY=cellHeight-height-12;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (cropped[(y * width + x) * 4 + 3] > 24) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    let footX = 0, footCount = 0;
    const footBottom=stem==='prince-actions'&&row===1&&col===0?465-group.y0:maxY;
    for (let y = Math.max(minY, footBottom - 4); y <= footBottom; y++) for (let x = minX; x <= maxX; x++) {
      if (cropped[(y * width + x) * 4 + 3] > 48) { footX += x; footCount++; }
    }
    frames[`${facings[row]}:${poses[col]}`] = {sheet: stem, x: col * cellWidth, y: row * cellHeight,
      width: cellWidth, height: cellHeight, pivotX: insetX+Math.round(footX / footCount), pivotY: insetY+footBottom,
      boundsWidth: maxX - minX + 1, boundsHeight: maxY - minY + 1,
      bodyHeight: stem==='prince-locomotion'?292:205};
    composites.push({input: await sharp(cropped, {raw:{width,height,channels:4}}).png().toBuffer(),left:col*cellWidth+insetX,top:row*cellHeight+insetY});
  }
  await sharp({create:{width:cellWidth*poses.length,height:cellHeight*4,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite(composites).webp({quality:90,alphaQuality:100}).toFile(path.join(root,'public/art',`${stem}.webp`));
  return {frames, source:{width:meta.width,height:meta.height}, cellWidth,cellHeight};
}
(async()=>{
  const results = {};
  results.locomotion = await build('prince-locomotion',['idle','walk:0','walk:1','walk:2']);
  if (fs.existsSync(path.join(__dirname,'prince-actions-original.png'))) results.actions = await build('prince-actions',['mine','cut','fish','smith','cook','melee','bow']);
  const frames = Object.assign({}, ...Object.values(results).map(result=>result.frames));
  fs.writeFileSync(path.join(__dirname,'atlas-metadata.json'), JSON.stringify(results,null,2)+'\n');
  const header = '/** Per-cell source geometry; never shrink an entire atlas to one sprite. */\nexport interface ActorAtlasFrame {\n  sheet: string;\n  x: number; y: number; width: number; height: number;\n  pivotX: number; pivotY: number;\n  boundsWidth: number; boundsHeight: number;\n  bodyHeight?: number;\n}\nexport type Facing = "ne" | "se" | "sw" | "nw";\n';
  fs.writeFileSync(path.join(root,'src/render/actor-atlas.ts'),header+'export const actorAtlas: Record<string, ActorAtlasFrame> = '+JSON.stringify(frames,null,2)+';\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([key,value])=>[key,{...value,frames:Object.keys(value.frames).length}]))));
})();

