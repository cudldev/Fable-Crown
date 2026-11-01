import {useEffect,useId,useMemo,useRef,useState} from "react";
import type {KeyboardEventHandler,RefObject} from "react";
import {Color} from "three";
import {loadedVoxelPreview} from "../render/three/voxel-assets";
import {ITEMS} from "../rpg/content";
import {itemCount} from "../rpg/inventory";
import {COTTAGE_TICKS} from "./contracts";
import type {ValleySave,ValleyService} from "./contracts";
import {VALLEY_RECIPES} from "./content";
import {craftedReceipt,craftingQuantity,craftingTicks,craftingView,recipesForService} from "./crafting-view";
import type {CraftCompletionCheck} from "./crafting-view";
import "./crafting.css";

const FURNITURE=new Set(["valley-stool","valley-table","valley-bed","valley-shelf","valley-chest","valley-planter"]);
const previews=new Map<string,Promise<string|undefined>>();
/** A cached Canvas2D projection of the already loaded runtime cubes; no extra asset request. */
function nativePreview(itemId:string):Promise<string|undefined>{
  const cached=previews.get(itemId);if(cached)return cached;
  const level=loadedVoxelPreview(itemId);if(!level)return Promise.resolve(undefined);
  const result=(async()=>{
    try{
      type Face={points:number[][];rgb:number[];depth:number};const faces:Face[]=[];
      const occupied=new Set<string>(),pitch=level.pitch,h=pitch/2,color=new Color();
      const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
      for(let i=0;i<level.count;i++)occupied.add(key(Math.round(level.centers[i*3]/pitch),Math.round(level.centers[i*3+1]/pitch),Math.round(level.centers[i*3+2]/pitch)));
      for(let i=0;i<level.count;i++){
        const x=level.centers[i*3],y=level.centers[i*3+1],z=level.centers[i*3+2],qx=Math.round(x/pitch),qy=Math.round(y/pitch),qz=Math.round(z/pitch);
        color.setRGB(level.colors[i*3],level.colors[i*3+1],level.colors[i*3+2]).convertLinearToSRGB();
        const rgb=[color.r*255,color.g*255,color.b*255],depth=x+y+z;
        if(!occupied.has(key(qx+1,qy,qz)))faces.push({points:[[x+h,y-h,z-h],[x+h,y-h,z+h],[x+h,y+h,z+h],[x+h,y+h,z-h]],rgb:rgb.map(c=>c*.75),depth:depth+pitch*.2});
        if(!occupied.has(key(qx,qy,qz+1)))faces.push({points:[[x-h,y-h,z+h],[x+h,y-h,z+h],[x+h,y+h,z+h],[x-h,y+h,z+h]],rgb:rgb.map(c=>c*.9),depth:depth+pitch*.3});
        if(!occupied.has(key(qx,qy+1,qz)))faces.push({points:[[x-h,y+h,z-h],[x+h,y+h,z-h],[x+h,y+h,z+h],[x-h,y+h,z+h]],rgb,depth:depth+pitch*.4});
      }
      if(!faces.length)return;
      const project=(p:number[])=>[(p[0]-p[2])*.866,(p[0]+p[2])*.45-p[1]];
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(const face of faces)for(const p of face.points){const [x,y]=project(p);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
      const canvas=document.createElement("canvas");canvas.width=192;canvas.height=192;
      const ctx=canvas.getContext("2d");if(!ctx)return;
      const scale=170/Math.max(maxX-minX,maxY-minY),offsetX=(192-(maxX-minX)*scale)/2,offsetY=(192-(maxY-minY)*scale)/2;
      ctx.imageSmoothingEnabled=false;
      for(const face of faces.sort((a,b)=>a.depth-b.depth)){
        ctx.beginPath();face.points.forEach((p,i)=>{const [x,y]=project(p),px=offsetX+(x-minX)*scale,py=offsetY+(y-minY)*scale;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});
        ctx.closePath();ctx.fillStyle=`rgb(${face.rgb.map(c=>Math.round(c)).join(",")})`;ctx.fill();
      }
      return canvas.toDataURL("image/png");
    }catch{return;}
  })();previews.set(itemId,result);return result;
}

export function ValleyItemPreview({itemId,large=false}:{itemId:string;large?:boolean}){
  const [loaded,setLoaded]=useState<{itemId:string;url:string}>();
  useEffect(()=>{let active=true;if(FURNITURE.has(itemId))void nativePreview(itemId).then(url=>{if(active&&url)setLoaded({itemId,url});});return()=>{active=false;};},[itemId]);
  const name=ITEMS[itemId]?.name??itemId;
  const url=loaded?.itemId===itemId?loaded.url:undefined;
  return <span className={`valley-item-preview${large?" is-large":""}`} aria-hidden="true">
    {url?<img src={url} alt="" draggable={false}/>:<span className="valley-item-initials">{name.split(" ").map(word=>word[0]).slice(0,2).join("")}</span>}
  </span>;
}
export interface ValleyCraftingProps {
  save:ValleySave;
  service:ValleyService;
  selectedId:string;
  onSelect(id:string):void;
  quantity:number;
  onQuantity(quantity:number):void;
  onCraft(recipeId:string,quantity:number):void;
  onBack():void;
  panelRef:RefObject<HTMLElement|null>;
  onKeyDown:KeyboardEventHandler<HTMLElement>;
  message:string;
  pending?:boolean;
}

export function ValleyCrafting({save,service,selectedId,onSelect,quantity,onQuantity,onCraft,onBack,panelRef,onKeyDown,message,pending=false}:ValleyCraftingProps){
  const quantityId=useId();
  const recipes=useMemo(()=>recipesForService(service),[service.kind,service.station]);
  const selected=recipes.find(recipe=>recipe.id===selectedId)??recipes[0];
  const view=selected?craftingView(save,service,selected,quantity):undefined;
  const previous=useRef<CraftCompletionCheck|null>(null),[receipt,setReceipt]=useState("");
  const job=save.valley.workQueue[0],jobRecipe=job?VALLEY_RECIPES[job.recipeId]:undefined;
  useEffect(()=>{if(selected&&selected.id!==selectedId)onSelect(selected.id);},[selected?.id,selectedId,onSelect]);
  useEffect(()=>{
    if(job&&jobRecipe){
      if(!previous.current){previous.current={recipeId:job.recipeId,quantity:job.quantity,ownedBefore:itemCount(save.chapter.player.inventory,jobRecipe.output.itemId)+itemCount(save.chapter.bank,jobRecipe.output.itemId)};setReceipt("");}
    }else if(previous.current){const text=craftedReceipt(previous.current,save);if(text)setReceipt(text);previous.current=null;}
  },[save,job?.recipeId,job?.quantity]);
  const title=service.station==="furnace"?"Smelting":service.station==="range"?"Cooking":"Carpentry";
  const status=[receipt||message,view?.reason].filter(Boolean).join(" · ")||"Finished items go to your backpack or connected storage.";
  return <section ref={panelRef} className="valley-crafting" role="dialog" aria-modal="true" aria-labelledby="valley-crafting-title"
    data-menu-panel="craft" data-testid="valley-crafting" aria-busy={pending||undefined} onKeyDown={onKeyDown}>
    <header className="crafting-header"><button type="button" onClick={onBack} aria-label="Back">Back</button><div><h2 id="valley-crafting-title">{title}</h2><p>{service.name}</p></div>
      {job&&jobRecipe&&<div className="crafting-job" data-testid="craft-queue"><span>Making {ITEMS[jobRecipe.output.itemId]?.name??jobRecipe.name} ×{job.quantity} · {Math.ceil(job.remainingTicks*.6)}s</span>
        <progress aria-label="Current craft progress" max={Math.max(job.remainingTicks,craftingTicks(save,jobRecipe)*job.quantity,1)} value={Math.max(0,craftingTicks(save,jobRecipe)*job.quantity-job.remainingTicks)}/></div>}
    </header>
    <div className="crafting-layout">
      <div className="crafting-grid" role="group" aria-label={`${title} recipes`} data-testid="recipe-grid">
        {recipes.map(recipe=>{const item=craftingView(save,service,recipe,quantity);return <button type="button" key={recipe.id} className="crafting-recipe"
          aria-pressed={selected?.id===recipe.id} aria-label={item.outputName} data-recipe-id={recipe.id} data-available={item.canCraft}
          onFocus={()=>onSelect(recipe.id)} onClick={()=>onSelect(recipe.id)}>
          <ValleyItemPreview itemId={recipe.output.itemId}/><span className="crafting-recipe-name">{item.outputName}</span>
          {recipe.requiresCottage&&save.valley.cottageTicks<COTTAGE_TICKS&&<span className="crafting-recipe-note">Cottage</span>}
        </button>;})}
        {!recipes.length&&<p className="crafting-empty">Interact with a workbench, brazier or cooking fire to see its recipes.</p>}
      </div>
      <section className="crafting-detail" aria-label="Selected recipe" data-testid="recipe-detail" data-selected-recipe={selected?.id}>
        {selected&&view?<>
          <div className="crafting-selection-heading"><ValleyItemPreview itemId={selected.output.itemId} large/><div><h3>{view.outputName}</h3><span>×{view.outputQuantity} · {view.seconds.toLocaleString()}s · +{view.xp.toLocaleString()} XP</span></div></div>
          <div className="crafting-detail-scroll"><ul className="crafting-materials" aria-label="Carried ingredients">{view.materials.map(material=><li key={material.itemId} data-material-item={material.itemId} data-missing={material.have<material.need}>
            <span>{material.name} · {material.need} needed</span><strong>{material.have} in bag</strong>
          </li>)}</ul><p className="crafting-skill">{selected.skill[0].toUpperCase()+selected.skill.slice(1)} {view.level} · Requires {selected.level}</p></div>
          <footer className="crafting-action"><p role="status" aria-live="polite" data-testid="craft-status">{pending?"Starting batch…":status}</p><div className="crafting-action-row"><div className="crafting-quantity"><label htmlFor={quantityId}>Batches</label><div className="crafting-counter">
            <button type="button" aria-label="Decrease craft quantity" disabled={view.quantity<=1||pending} onClick={()=>onQuantity(craftingQuantity(view.quantity-1))}>−</button>
            <input id={quantityId} type="number" inputMode="numeric" min={1} max={100} step={1} aria-label="Craft quantity" disabled={pending} value={view.quantity} onChange={event=>onQuantity(craftingQuantity(event.currentTarget.valueAsNumber))}/>
            <button type="button" aria-label="Increase craft quantity" disabled={view.quantity>=100||pending} onClick={()=>onQuantity(craftingQuantity(view.quantity+1))}>+</button></div></div>
            <button type="button" className="crafting-make" data-testid="craft-primary" disabled={!view.canCraft||pending} aria-label={`Make ${view.outputQuantity} ${view.outputName}`}
              onClick={()=>{if(pending||!view.canCraft)return;setReceipt("");onCraft(selected.id,view.quantity);}}>{pending?"Starting…":`Make${view.quantity>1?` ×${view.outputQuantity}`:""}`}</button></div></footer>
        </>:<p>Select a recipe at the matching station.</p>}
      </section>
    </div>
  </section>;
}
export default ValleyCrafting;
