const sharp=require('C:/Users/antto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
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

(async()=>{for(const n of ['cook-corrected']){const {data,info}=await sharp(__dirname+'/work-'+n+'-original.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});const {figures}=isolate(data,info.width,info.height);console.log(n,figures.map(g=>[g.x0,g.y0,g.x1,g.y1,g.count]))}})();

