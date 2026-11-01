import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {KeyboardEvent} from "react";
import {SceneHost} from "../render/SceneHost";
import type {ScenePreparation,TileCamera,TileSelection} from "../render/scene-types";
import {WorldContextMenu} from "../rpg/WorldContextMenu";
import {useActionControls,focusableMenuElements} from "../action/useActionControls";
import type {ActionState} from "../action/contracts";
import {actionSafe} from "../action/rpg-adapter";
import {ITEMS} from "../rpg/content";
import {itemCount,inventorySlots} from "../rpg/inventory";
import {tile} from "../rpg/world";
import type {EquipmentSlot} from "../rpg/types";
import {COTTAGE_TICKS,FIRST_BILL,FORGE_TICKS} from "./contracts";
import type {FurnitureId,ValleyCommand,ValleySave,ValleyWorkerMessage,ValleyWorkerRequest,ValleyFeedback,ValleyService,PointerActivity,AmbientNpcPose} from "./contracts";
import {ValleyMenu} from "./ValleyMenu";
import {ValleyInteraction} from "./ValleyInteraction";
import {ValleyCrafting,ValleyItemPreview} from "./ValleyCrafting";
import type {ConversationCursor} from "./conversation";
import type {ValleyPanel} from "./ValleyMenu";
import {valleyActionContext,valleyInteractionCue} from "./interaction-feedback";
import {pointTarget} from "./point-actions";
import {serviceSections} from "./services";
import {VALLEY_COMMISSIONS,VALLEY_RECIPES,VALLEY_STOCK,visitorStock} from "./content";
import {getOnboarding,getVisitors,VALLEY_DIRECTIONS,FUTURE_GRANTS} from "./onboarding";
import {createValleyWorld,homeFootprints,furnitureFootprint,sampleValleyGround,validateHomePlacement,validateFurniturePlacement,editValleyGround,OWNED_BOUNDS} from "./world";
import "./valley.css";

type Panel=ValleyPanel|null;
type TerrainOperation=Extract<ValleyCommand,{type:"terrain"}>["operation"];
type Placement={kind:"home"|"furniture"|"move"|"terrain"|"plant";x:number;z:number;rotation:0|1|2|3;itemId?:FurnitureId;id?:string;operation?:TerrainOperation;plant?:"flowers"|"sapling"};
const AXES={right:{x:45/55.217,z:-32/55.217},forward:{x:-32/55.217,z:-45/55.217}};
const FURNITURE:FurnitureId[]=["stool","table","bed","shelf","chest","planter"];
const name=(id:string)=>ITEMS[id]?.name??id;
const amount=(value:number)=>Number.isFinite(value)?Math.min(100,Math.max(1,Math.floor(value))):1;
const time=(ticks:number)=>`${Math.ceil(Math.max(0,ticks)*.6/60)} min`;
const TITLES:Record<Exclude<Panel,null>,string>={interaction:"Interaction",menu:"Game menu",inventory:"Backpack & storage",craft:"Carpentry & cooking",trade:"Supply caravan",home:"Your home",projects:"Orders & public projects",visitor:"Valley visitors",journal:"Valley journal",land:"Ground & garden",settings:"Settings & saving"};
function touchPreferences():{handedness:"right"|"left";raised:boolean}{try{const value=JSON.parse(localStorage.getItem("fable-valley-touch")??"null");return {handedness:value?.handedness==="left"?"left":"right",raised:value?.raised===true};}catch{return {handedness:"right",raised:false};}}
function download(save:ValleySave){const url=URL.createObjectURL(new Blob([JSON.stringify(save)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="fable-crown-valley.json";a.click();URL.revokeObjectURL(url);}

export default function ValleyApp(){
  const [save,setSave]=useState<ValleySave|null>(null),[hud,setHud]=useState<ActionState>();
  const [sceneEpoch,setSceneEpoch]=useState(0);
  const [pointer,setPointer]=useState<PointerActivity|null>(null),[ambient,setAmbient]=useState<AmbientNpcPose[]>([]);
  const pointerRef=useRef<PointerActivity|null>(null),ambientRef=useRef<AmbientNpcPose[]>([]);
  const [worldMenu,setWorldMenu]=useState<{selection:TileSelection;x:number;y:number}|null>(null);
  const [camera,setCamera]=useState<TileCamera>({x:48,y:140,zoom:1.35,follow:true,overview:false,grid:false});
  const [preparation,setPreparation]=useState<ScenePreparation>({stage:"chapter"}),[startupError,setStartupError]=useState("");
  const [{panel,history},setMenu]=useState<{panel:Panel;history:ValleyPanel[]}>({panel:null,history:[]});
  const [placement,setPlacement]=useState<Placement|null>(null),[placementDraft,setPlacementDraft]=useState<Placement|null>(null),[placementDetails,setPlacementDetails]=useState(false),[selection,setSelection]=useState<TileSelection|null>(null);
  const [tool,setTool]=useState(true),[message,setMessage]=useState("A quiet valley, and room to make a home.");
  const [feedback,setFeedback]=useState<ValleyFeedback|null>(null),[recent,setRecent]=useState<ValleyFeedback[]>([]),[feedbackVisible,setFeedbackVisible]=useState(false);
  const [touch,setTouch]=useState(touchPreferences),[destination,setDestination]=useState<{label:string;x:number;z:number}|null>(null);
  const [service,setService]=useState<ValleyService|null>(null);
  const [conversation,setConversation]=useState<ConversationCursor>("greeting");
  const [conversationResponse,setConversationResponse]=useState("");
  const [safeArea,setSafeArea]=useState({left:0,top:0,right:1,bottom:.68});
  const [reducedMotion,setReducedMotion]=useState(()=>matchMedia("(prefers-reduced-motion: reduce)").matches);
  const suspended=useRef<{panel:Panel;history:ValleyPanel[]}|null>(null),transaction=useRef(false),receiptMessage=useRef("");
  const [transacting,setTransacting]=useState(false);
  const deferredNotice=useRef<ValleyFeedback|null>(null),presentation=useRef({panel,placement});presentation.current={panel,placement};
  const [quantity,setQuantity]=useState(1),[payment,setPayment]=useState(10),[visitorId,setVisitorId]=useState("builder");
  const [recipeId,setRecipeId]=useState("valley-plank"),[tradeItem,setTradeItem]=useState("logs");
  const [storageOkay,setStorageOkay]=useState(true),[resetConfirm,setResetConfirm]=useState(false),[pending,setPending]=useState(false);
  const worker=useRef<Worker|null>(null),action=useRef<ActionState|undefined>(undefined),sequence=useRef(0);
  const pendingSave=useRef<ValleySave|undefined>(undefined);
  const receipts=useRef(new Map<number,(ok:boolean,message?:string)=>void>()),panelElement=useRef<HTMLElement>(null),fileInput=useRef<HTMLInputElement>(null);
  const feedbackSequence=useRef(0),menuEpoch=useRef(0),focusReturn=useRef<HTMLElement|null>(null),menuFocus=useRef<Partial<Record<ValleyPanel,string>>>({});
  const unavailable=preparation.stage==="unavailable";
  const ready=!!save&&(preparation.stage==="ready"||unavailable)&&!startupError;
  const enabled=ready&&!panel&&!placement&&!worldMenu&&!unavailable;
  const live=useRef({ready,tool,enabled});live.current={ready,tool,enabled};
  const post=useCallback((request:ValleyWorkerRequest)=>worker.current?.postMessage(request),[]);
  const command=(value:ValleyCommand,callback?:(ok:boolean,message?:string)=>void):void=>{if(!callback&&["pay","forge-deliver","store","withdraw"].includes(value.type)){transact(value);return;}const requestId=++sequence.current;if(callback)receipts.current.set(requestId,callback);post({type:"command",command:value,requestId});};
  const transact=(value:ValleyCommand,callback?:(ok:boolean,message?:string)=>void):void=>{if(transaction.current)return;transaction.current=true;setTransacting(true);command(value,(ok,text)=>{transaction.current=false;setTransacting(false);callback?.(ok,text);});};
  const setPanel=(next:Panel)=>{setMenu({panel:next,history:[]});if(!next){setService(null);suspended.current=null;}};
  const closeMenus=()=>{controls.clear();if(suspended.current){setMenu(suspended.current);suspended.current=null;}else setPanel(null);};
  const open=(next:Panel,fromObject=false)=>{setWorldMenu(null);if(!fromObject&&next&&["craft","trade","projects","visitor"].includes(next)&&!serviceSections(service).some(section=>section.panel===next)){showFeedback({tone:"info",title:"Use the matching place in your valley",detail:"Interact with a workbench, fire, caravan, project board or visitor to open its actions."});return;}menuEpoch.current=feedbackSequence.current;setPlacement(null);if(next==="menu"||!next)setService(null);if(panel&&document.activeElement instanceof HTMLElement)menuFocus.current[panel]=document.activeElement.textContent??"";if(!panel&&document.activeElement instanceof HTMLElement)focusReturn.current=document.activeElement;setMenu(current=>({panel:next,history:next&&current.panel&&current.panel!==next?[...current.history,current.panel]:next?current.history:[]}));};
  const back=()=>{controls.clear();if(worldMenu){setWorldMenu(null);return;}if(!panel&&!placement){post({type:"cancel"});return;}menuEpoch.current=feedbackSequence.current;if(panel==="menu"&&!history.length&&suspended.current){setMenu(suspended.current);suspended.current=null;return;}if(panel){if(!history.length)setService(null);setMenu(current=>({panel:current.history.at(-1)??null,history:current.history.slice(0,-1)}));}else setPlacement(null);};
  const showFeedback=useCallback((next:Omit<ValleyFeedback,"id">)=>{const value={...next,id:++feedbackSequence.current};setRecent(old=>[value,...old].slice(0,10));const active=presentation.current.panel;if((active||presentation.current.placement)&&(/^(Your cottage is ready|The public forge is ready)/.test(value.title)||active!=="craft"&&value.title==="Crafting complete")){deferredNotice.current=value;return;}setMessage(value.title);setFeedback(value);setFeedbackVisible(true);},[]);
  const controls=useActionControls({enabled,mouseActions:false,cameraAxes:AXES,onToggleTool:()=>{setTool(current=>!current);},onInteract:()=>post({type:"interact"}),onInventory:()=>{if(ready&&!service)open(panel==="inventory"?null:"inventory");},onMenu:()=>{if(!ready)return;if(service&&panel&&panel!=="menu"&&!suspended.current){suspended.current={panel,history};controls.clear();setMenu({panel:"menu",history:[]});}else panel?closeMenus():open("menu");},onBuild:()=>{if(ready&&!service)open(panel==="land"?null:"land");},onBack:back});
  const readAction=useCallback(()=>action.current,[]);
  const onPreparation=useCallback((next:ScenePreparation)=>setPreparation(old=>old.stage===next.stage&&old.message===next.message?old:next),[]);

  useEffect(()=>{
    let instance:Worker;try{instance=new Worker(new URL("./game.worker.ts",import.meta.url),{type:"module"});}catch{setStartupError("The valley could not start. Reload to try again.");return;}
    worker.current=instance;let first=true;
    instance.onmessage=(event:MessageEvent<ValleyWorkerMessage>)=>{
      const next=event.data;if(next.save){if(first){first=false;setSave(next.save);setCamera(old=>({...old,x:next.save!.action.player.x,y:next.save!.action.player.z}));}else pendingSave.current=next.save;}
      if(next.action)action.current=next.action;
      if(next.pointer!==undefined)pointerRef.current=next.pointer;if(next.ambient)ambientRef.current=next.ambient;
      if(next.message?.startsWith("Chapter restored.")||next.message?.startsWith("A new valley chapter begins."))setSceneEpoch(epoch=>epoch+1);
      if(next.feedback||next.message)receiptMessage.current=next.feedback?.title??next.message??"";
      if(next.feedback)showFeedback(next.feedback);else if(next.message)showFeedback({tone:/invalid|unavailable|could not|requires/i.test(next.message)?"warning":"info",title:next.message});
      if(next.storageOkay!==undefined)setStorageOkay(next.storageOkay);
      if(next.open&&next.service){if(next.action)setHud(next.action);if(next.ambient)setAmbient(next.ambient);setService(next.service);setConversation("greeting");setConversationResponse("");menuEpoch.current=feedbackSequence.current;setPlacement(null);suspended.current=null;setMenu({panel:"interaction",history:[]});if(next.visitorId&&["builder","merchant","smith"].includes(next.visitorId)){setVisitorId(next.visitorId);command({type:"talk-visitor",id:next.visitorId});}}
      if(next.message?.startsWith("Chapter restored.")){setService(null);suspended.current=null;deferredNotice.current=null;setConversation("greeting");setConversationResponse("");setMenu({panel:"settings",history:["menu"]});}
      if(next.receipt?.requestId!==undefined){receipts.current.get(next.receipt.requestId)?.(next.receipt.ok,receiptMessage.current);receipts.current.delete(next.receipt.requestId);}
      if(next.export)download(next.export);
    };
    instance.onerror=()=>setStartupError("The valley worker stopped. Export or reload after checking your saved chapter.");
    instance.postMessage({type:"pause"});return()=>{instance.terminate();worker.current=null;};
  },[]);
  useEffect(()=>{const sync=()=>post({type:live.current.ready&&!document.hidden?"resume":"pause"});sync();document.addEventListener("visibilitychange",sync);return()=>document.removeEventListener("visibilitychange",sync);},[ready,post]);
  useEffect(()=>{if(ready)post({type:"interface",open:!!panel||!!placement||!!worldMenu,npcId:service?.kind==="visitor"?service.objectId:undefined});},[ready,!!panel,!!placement,!!worldMenu,service?.objectId,post]);
  useEffect(()=>{const query=matchMedia("(prefers-reduced-motion: reduce)"),change=()=>setReducedMotion(query.matches);query.addEventListener("change",change);return()=>query.removeEventListener("change",change);},[]);
  useEffect(()=>{if(!service||panel!=="interaction")return;const measure=()=>{const viewport=document.querySelector(".valley-viewport")?.getBoundingClientRect(),dialog=panelElement.current?.getBoundingClientRect();if(!viewport||!dialog)return;const landscape=viewport.width>viewport.height;const next=landscape?{left:0,top:0,right:Math.max(.35,(dialog.left-viewport.left-12)/viewport.width),bottom:1}:{left:0,top:0,right:1,bottom:Math.max(.35,(dialog.top-viewport.top-24)/viewport.height)};setSafeArea(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);};measure();const observer=new ResizeObserver(measure);if(panelElement.current)observer.observe(panelElement.current);window.addEventListener("resize",measure);return()=>{observer.disconnect();window.removeEventListener("resize",measure);};},[service?.objectId,panel,conversation]);
  useEffect(()=>{try{localStorage.setItem("fable-valley-touch",JSON.stringify(touch));}catch{/* Input preferences are optional; chapter saving is independent. */}},[touch]);
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedbackVisible(false),feedback.tone==="danger"||feedback.tone==="warning"?8000:5500);return()=>clearTimeout(timer);},[feedback]);
  useEffect(()=>{if(!panel&&!placement&&deferredNotice.current){const notice=deferredNotice.current;deferredNotice.current=null;setMessage(notice.title);setFeedback(notice);setFeedbackVisible(true);}},[!!panel,!!placement]);
  useEffect(()=>{let frame=0,last=-Infinity;const update=(now:number)=>{const input=controls.inputBuffer.read();input.tool=live.current.tool;if(!live.current.enabled){input.moveX=0;input.moveZ=0;input.strike=false;input.block=false;}post({type:"input",input});if(now-last>=100){last=now;setHud(action.current);setPointer(pointerRef.current);setAmbient(old=>JSON.stringify(old)===JSON.stringify(ambientRef.current)?old:ambientRef.current);if(pendingSave.current){setSave(pendingSave.current);pendingSave.current=undefined;}}frame=requestAnimationFrame(update);};frame=requestAnimationFrame(update);return()=>cancelAnimationFrame(frame);},[controls.inputBuffer,post]);
  useEffect(()=>{if(!panel&&!placement){if(focusReturn.current?.isConnected)focusReturn.current.focus();return;}const buttons=panelElement.current?focusableMenuElements(panelElement.current):[];const remembered=panel?menuFocus.current[panel]:null;const target=buttons.find(button=>remembered&&button.textContent===remembered)??(panel==="menu"?panelElement.current?.querySelector<HTMLButtonElement>(".valley-menu-resume"):buttons[0]);target?.focus();},[panel,!!placement]);
  useEffect(()=>{if(!placement)return;const key=(event:globalThis.KeyboardEvent)=>{if(event.defaultPrevented||event.target instanceof Element&&event.target.closest("input,textarea,select,[contenteditable]"))return;const delta:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(delta[event.key]){event.preventDefault();const [dx,dz]=delta[event.key];setPlacement(old=>old?{...old,x:old.x+dx,z:old.z+dz}:null);}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[!!placement]);

  const world=useMemo(()=>save?createValleyWorld(save.valley,save.chapter):undefined,[save]);
  const sampleGround=useCallback((x:number,z:number)=>save?sampleValleyGround(save.valley,x,z):0,[save?.valley]);
  const groundRevision=save?JSON.stringify(save.valley.ground):"";
  const visitors=save?getVisitors(save,Date.now()):[],onboarding=save?getOnboarding(save,Date.now()):undefined;
  const player=hud?.player??save?.action.player,complete=!!save&&save.valley.cottageTicks>=COTTAGE_TICKS;
  const footprint=save?homeFootprints(save.valley):null,coins=save?itemCount(save.chapter.player.inventory,"coins")+itemCount(save.chapter.bank,"coins"):0;
  const paymentAmount=Math.min(payment,Math.max(1,FIRST_BILL-(save?.valley.paid??0)));
  const stockDate=new Date().toDateString();
  const todayStock=useMemo(()=>new Set(visitorStock(Date.now()).map(stock=>stock.itemId)),[stockDate]);
  // Worker snapshots replace valley objects; this content key keeps route checks off HUD-only renders.
  const placementLayoutKey=save?JSON.stringify([save.valley.layoutRevision,save.valley.home,save.valley.paid===FIRST_BILL,complete,save.valley.ground,save.valley.furniture,save.valley.plants]):"";
  const playerX=player?.x??0,playerZ=player?.z??0;
  const context=useMemo(()=>save&&player&&world?valleyActionContext(save,hud??save.action,world,tool):null,[save,hud,world,tool]);
  const storageAccess=service?.kind==="home"||service?.kind==="storage";
  const accountAccess=service?.kind==="visitor"&&service.visitorId==="builder";
  const menuSections=service?serviceSections(service):(panel==="home"||panel==="land")?[{panel:"home"as const,label:"Home"},{panel:"land"as const,label:"Ground & garden"}]:[];
  const stock=VALLEY_STOCK.find(value=>value.itemId===tradeItem)??VALLEY_STOCK[0];
  const accountOnly=service?.kind==="caravan"||service?.kind==="visitor";
  const panelTitle=panel==="craft"?(service?.station==="furnace"?"Smelting":service?.station==="range"?"Cooking":"Carpentry"):panel==="inventory"&&!storageAccess?"Backpack & equipment":panel?TITLES[panel]:"";
  const cueState=useRef({save,world,enabled,tool});cueState.current={save,world,enabled,tool};
  const readInteractionCue=useCallback(()=>{const current=cueState.current,snapshot=action.current;if(!current.enabled||!current.save||!current.world||!snapshot)return;return valleyInteractionCue(current.save,snapshot,current.world,current.tool);},[]);
  const canInteractSelection=useCallback(()=>cueState.current.enabled,[]);
  const sceneCamera=useMemo<TileCamera>(()=>{
    const following={...camera,follow:true,overview:false,dynamicFollow:true,reducedMotion};
    if(!service||!player)return following;
    const object=world?.objects.find(o=>o.id===service.objectId),person=service.kind==="visitor";
    return {...following,interaction:{player:{x:player.x,z:player.z},target:object&&!person?{x:object.position.x+(object.width-1)/2,z:object.position.y+(object.height-1)/2}:{x:service.x,z:service.z},...(!person?{targetSize:{width:Math.max(service.kind==="workbench"?2.4:1.4,(object?.width??1)+.4),depth:Math.max(service.kind==="workbench"?2.4:1.4,(object?.height??1)+.4),height:service.kind==="home"?3:1.6}}:{}),safeArea,reducedMotion}};
  },[camera,service,player?.x,player?.z,world,safeArea,reducedMotion]);
  const openContextAction=(next:import("./contracts").ValleyServicePanel)=>{if(!serviceSections(service).some(section=>section.panel===next))return;controls.clear();open(next,true);};
  const plantingSupplies=save&&placement?.kind==="plant"?itemCount(save.chapter.player.inventory,placement.plant==="flowers"?"valley-flower-seeds":"valley-sapling"):0;
  const placementCheck=useMemo(()=>{
    if(!placement||!save)return {error:null as string|null,description:""};
    const p=placement,v=save.valley;
    if(p.kind==="home")return {error:validateHomePlacement(v,p.x,p.z,p.rotation),description:"Confirm to place your tent and reserve the cottage pad."};
    const rangeError=Math.hypot(p.x-playerX,p.z-playerZ)>6?"Stand within six metres of the chosen spot.":null;
    if(p.kind==="furniture"||p.kind==="move")return {error:rangeError??validateFurniturePlacement(v,p.itemId!,p.x,p.z,p.rotation,p.id,{x:playerX,z:playerZ}),description:`Confirm to ${p.kind==="move"?"move":"place"} your ${p.itemId}.`};
    if(p.kind==="plant")return {error:!v.home?"Place your tent before planting.":validateFurniturePlacement(v,"planter",p.x,p.z,0)??rangeError??(!plantingSupplies?`Carry ${p.plant==="flowers"?"flower seeds":"a young sapling"} for planting.`:null),description:`Confirm to plant ${p.plant==="flowers"?"flowers":"a young sapling"} at ${p.x}, ${p.z}.`};
    const original=v.ground[`${p.x},${p.z}`]??{level:0,path:false};
    let level:number=original.level,stairs:number|undefined=original.stairs,path=original.path;
    const directions=["north","east","south","west"];
    if(p.operation==="raise"){level++;stairs=undefined;}else if(p.operation==="lower"){level--;stairs=undefined;}
    else if(p.operation==="path"||p.operation==="grass")path=p.operation==="path";
    else {stairs=directions.indexOf(p.operation?.replace("stairs-","")??"");if(level===1)level=0;}
    const height=level*.5;
    const description=`Preview: ${height>0?"+":""}${height.toFixed(1)} m terrace${stairs!==undefined?`, four treads rising ${directions[stairs]}`:""}, ${path?"path":"grass"}. Confirm to apply ${p.operation?.replace("-"," ")}.`;
    const candidate=structuredClone(v),result=editValleyGround(candidate,p.x,p.z,p.operation!,{x:playerX,z:playerZ});
    return {error:result.ok?rangeError:result.message,description};
  },[placement,placementLayoutKey,playerX,playerZ,plantingSupplies]);
  const placementError=placementCheck.error;
  const preview=useMemo(()=>{if(!placement)return[];const color=placementError?0xf28c72:0xc5e392;
    if(placement.kind==="home"){const fp=homeFootprints({x:placement.x,z:placement.z,rotation:placement.rotation,tentPacked:false})!;return[{x:OWNED_BOUNDS.minX,z:OWNED_BOUNDS.minZ,width:64,height:32,color:0xc5e392},{...fp.pad,color},{...fp.tent,color:0xe9d49b},{...fp.cottage,color:0x8bcad5}];}
    if(placement.itemId)return[{...furnitureFootprint(placement.itemId,placement.x,placement.z,placement.rotation),color}];
    return[{x:placement.x,z:placement.z,width:1,height:1,color}];},[placement,placementError]);
  function focusCamera(x:number,z:number,label?:string){setPanel(null);if(label){setDestination({x,z,label});showFeedback({tone:"info",title:`Finding ${label}`,detail:"Destination pinned. Walk there with the movement controls; the camera follows you."});}}
  function focus(selected:TileSelection){
    if(placement){const position=selected.kind==="tile"?selected.position:selected.kind==="object"?world?.objects.find(o=>o.id===selected.id)?.position:undefined;if(position)setPlacement(old=>old?{...old,x:Math.round(position.x),z:Math.round(position.y)}:null);return;}
    if(!live.current.enabled)return;controls.inputBuffer.setBlock("virtual",false);setWorldMenu(null);setSelection(selected);if(selected.kind==="object"&&world?.objects.find(object=>object.id===selected.id)?.resourceId)setTool(true);if(selected.kind==="enemy")setTool(false);post({type:"point",selection:selected});
  }
  function choosePoint(selected:TileSelection,intent?:"walk"|"examine"){setWorldMenu(null);controls.clear();if(!intent&&selected.kind==="object"&&world?.objects.find(object=>object.id===selected.id)?.resourceId)setTool(true);if(!intent&&selected.kind==="enemy")setTool(false);post({type:"interface",open:false});post({type:"point",selection:selected,intent});}
  const pointMenuTarget=worldMenu&&save&&world?pointTarget(save,world,worldMenu.selection):null;
  const pointMenuItems=worldMenu?[...(worldMenu.selection.kind!=="tile"?[{label:pointMenuTarget?.label??"Interact",run:()=>choosePoint(worldMenu.selection)}]:[]),{label:"Walk here",run:()=>choosePoint(worldMenu.selection,"walk")},...(worldMenu.selection.kind!=="tile"?[{label:"Examine",run:()=>choosePoint(worldMenu.selection,"examine")}]:[])]:[];
  function startPlacement(kind:Placement["kind"],extra:Partial<Placement>={}){controls.clear();setPanel(null);setPlacementDraft(null);setPlacementDetails(false);setPlacement({kind,x:Math.round(player?.x??40),z:Math.round(player?.z??155),rotation:0,...extra});}
  function confirmPlacement(){if(!placement||pending||placementError)return;const p=placement;let value:ValleyCommand;
    if(p.kind==="home")value={type:"place-home",x:p.x,z:p.z,rotation:p.rotation};
    else if(p.kind==="furniture")value={type:"place-furniture",itemId:p.itemId!,x:p.x,z:p.z,rotation:p.rotation};
    else if(p.kind==="move")value={type:"move-furniture",id:p.id!,x:p.x,z:p.z,rotation:p.rotation};
    else if(p.kind==="terrain")value={type:"terrain",x:p.x,z:p.z,operation:p.operation!};
    else value={type:"plant",x:p.x,z:p.z,kind:p.plant!};
    setPending(true);command(value,ok=>{setPending(false);if(ok&&p.kind!=="terrain"&&p.kind!=="plant")setPlacement(null);});
  }
  function trap(event:KeyboardEvent<HTMLElement>){if(event.key!=="Tab")return;const elements=focusableMenuElements(event.currentTarget),first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  const locationButton=(label:string,x:number,z:number)=><button type="button" className="valley-location" onClick={()=>focusCamera(x,z,label)}>Find {label} ({x}, {z})</button>;
  const quantityField=<div className="valley-quantity"><label htmlFor="valley-quantity">Quantity</label><button type="button" aria-label="Decrease quantity" disabled={quantity<=1} onClick={()=>setQuantity(value=>Math.max(1,value-1))}>−</button><input id="valley-quantity" aria-label="Quantity" type="number" min={1} max={100} value={quantity} onChange={e=>setQuantity(amount(e.currentTarget.valueAsNumber))}/><button type="button" aria-label="Increase quantity" disabled={quantity>=100} onClick={()=>setQuantity(value=>Math.min(100,value+1))}>+</button></div>;

  return <main className="game-shell valley-app" data-testid="valley-app" data-ready={ready} data-mode={unavailable?"dashboard":"world"} data-preparing={!ready} data-panel-open={!!panel}
    data-player-x={player?.x.toFixed(3)} data-player-z={player?.z.toFixed(3)} data-guard={player?.guard.toFixed(2)} data-blocking={player?.blocking??false} data-wilderness={!!player&&!actionSafe(player.x,player.z)} data-swing={player?.swing.toFixed(3)} data-action-frame={hud?.frame}
    data-controls="point" data-point-menu={!!worldMenu} data-pointer-kind={pointer?.kind??"none"} data-pointer-phase={pointer?.phase??"none"} data-camera-zoom={camera.zoom.toFixed(3)} data-camera-follow={camera.follow} data-controls-hand={touch.handedness} data-controls-raised={touch.raised} data-context-active={!!service} data-input-mode={controls.inputMode} data-tool-mode={tool?"tool":"weapon"} data-ui-state={worldMenu?"menu":panel==="interaction"?"interaction":panel==="craft"?"crafting":panel?"menu":placement?"placement":"exploration"}>
    <div className="valley-viewport" {...controls.worldBindings} inert={!ready||!!panel||!!worldMenu}>
      {save&&world&&!unavailable&&<SceneHost state={save.chapter} worldOverride={world} readAction={readAction} sampleGround={sampleGround} groundRevision={groundRevision} presentationEpoch={sceneEpoch}
        pointControls directInput={!placement} ambientNpcs={ambient} previewRoute={!panel&&!worldMenu?pointer?.path.map(p=>tile(p.x,p.z)):[]} placementPreview={preview} camera={sceneCamera} onCamera={setCamera} readInteractionCue={readInteractionCue} canInteractSelection={canInteractSelection} selection={selection} onSelect={focus} onInteract={focus} onContextMenu={(selected,point)=>{if(live.current.enabled){controls.clear();setWorldMenu({selection:selected,...point});}}} onPreparation={onPreparation}/>}
    </div>
    {ready&&save&&<div className="valley-play-ui" inert={!!panel||!!placement}>
      {unavailable&&<section className="valley-dashboard" aria-label="Valley dashboard"><h1>Your valley</h1><p>The 3D view is unavailable. Your journal, crafting, storage and save tools remain accessible. World actions still require standing nearby.</p><p>{preparation.message}</p><button onClick={()=>location.reload()}>Retry 3D view</button></section>}
      <header className="valley-hud"><div className="valley-vitals"><strong>Fable Crown <small>Your valley</small></strong><div className="valley-meter-row"><label>HP {player?.health}/{player?.maxHealth}<meter aria-label="Player health" min={0} max={player?.maxHealth??10} value={player?.health??10}/></label><label>Guard {Math.round(player?.guard??100)}%<meter aria-label="Guard stamina" min={0} max={100} value={player?.guard??100}/></label></div><span>{coins} coins · Bag {inventorySlots(save.chapter.player.inventory)}/28</span></div>
      <nav className="valley-hud-actions" aria-label="Valley menus"><button onClick={()=>open("inventory")}>Bag</button><button className="valley-menu-open" onClick={()=>open("menu")}>Menu</button></nav></header>
      <div className="valley-current-goal"><button onClick={()=>open("journal")} aria-label="Open current goal">{save.valley.goal||onboarding?.nextGoal}</button></div>
      {!panel&&!placement&&!unavailable&&<nav className="valley-camera" aria-label="Camera controls"><button onClick={()=>open("settings")}>Camera</button></nav>}
      {destination&&!panel&&!placement&&<div className="valley-destination"><span>{destination.label} · {Math.ceil(Math.hypot(destination.x-playerX,destination.z-playerZ))} m away</span><button aria-label="Dismiss destination" onClick={()=>setDestination(null)}>×</button></div>}
      <div className="valley-message valley-feedback" role="status" data-testid="valley-feedback" data-feedback-id={feedback?.id} data-tone={feedback?.tone??"info"} data-visible={feedbackVisible&&!panel&&!placement} aria-hidden={!feedbackVisible||!!panel||!!placement}>
        <strong key={feedback?.id}>{message}</strong>{feedback?.detail&&<span>{feedback.detail}</span>}
      </div>
      {!storageOkay&&<div className="valley-storage-warning" role="alert">Device saving is unavailable. Export your valley from Menu → Settings.</div>}
      {!panel&&!placement&&!unavailable&&<>
        <div className="valley-context" data-testid="valley-context" data-target-ready={context?.ready}>
          {placementDraft?<><strong>Placement saved while you walk</strong><div className="valley-button-row"><button onClick={()=>{setPlacement(placementDraft);setPlacementDraft(null);}}>Resume placement</button><button onClick={()=>setPlacementDraft(null)}>Discard</button></div></>:<><strong>{pointer?.label||context?.interaction?.detail||"Your valley"}</strong><span>{pointer?pointer.phase==="walking"?"Walking to the selected spot…":"Working on your selected task":"Click or tap ground to walk; select a person or object to approach."}</span>{pointer&&<button className="valley-stop" onClick={()=>post({type:"cancel"})}>Stop</button>}<span className="valley-device-hints">{controls.inputMode==="controller"?"Left stick: move · A: interact · RT: strike · LT: guard":"Right-click or hold: options · Escape: stop / back"}</span></>}
        </div>
        {save.valley.workQueue[0]&&<div className="valley-working" role="status">Crafting · {VALLEY_RECIPES[save.valley.workQueue[0].recipeId]?.name} · {Math.ceil(save.valley.workQueue[0].remainingTicks*.6)}s remaining</div>}
        {controls.inputMode==="touch"&&player&&!actionSafe(player.x,player.z)&&<button className="valley-touch-guard" aria-label="Hold guard" aria-pressed={player.blocking} onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);controls.inputBuffer.setBlock("virtual",true);}} onPointerUp={()=>controls.inputBuffer.setBlock("virtual",false)} onPointerCancel={()=>controls.inputBuffer.setBlock("virtual",false)} onLostPointerCapture={()=>controls.inputBuffer.setBlock("virtual",false)}>Guard<small>Hold</small></button>}

      </>}
      <output className="valley-observable" data-testid="valley-player-position">{player?`${player.x.toFixed(2)}, ${player.z.toFixed(2)}`:"—"}</output>
    </div>}
    {!ready&&<section className="valley-preparation" role={startupError?"alert":"status"} aria-live="polite"><div><span>Fable Crown</span><h1>{startupError?"The valley could not open":"Preparing your valley"}</h1><p>{startupError||preparation.message||(preparation.stage==="chapter"?"Opening your saved chapter…":"Loading the world and preparing the light…")}</p>{startupError&&<button onClick={()=>location.reload()}>Reload</button>}</div></section>}
    {worldMenu&&<div className="valley-world-menu" data-action-menu><WorldContextMenu x={worldMenu.x} y={worldMenu.y} items={pointMenuItems} onClose={()=>setWorldMenu(null)}/></div>}
    {ready&&placement&&<aside className="valley-placement" ref={panelElement} role="dialog" aria-label="Placement controls" onKeyDown={trap}>
      <header><h2>{placement.kind==="home"?"Choose your home pad":placement.kind==="terrain"?"Shape one tile":placement.kind==="plant"?"Plant your garden":"Place furnishing"}</h2><button onClick={()=>setPlacement(null)}>Cancel</button></header>
      <button className="valley-placement-adjust" aria-expanded={placementDetails} onClick={()=>setPlacementDetails(value=>!value)}>{placementDetails?"Hide adjustments":"Adjust position"}</button>
      <div className="valley-placement-details" data-expanded={placementDetails}>
      <p>{placement.kind==="home"?"Select clear owned ground. Gold marks the tent; blue reserves the future cottage. The full pad is 10 × 8 tiles.":"Select a world tile or adjust X/Z. Stand near the chosen spot before confirming."}</p>
      <div className="valley-coordinates"><label>X <input aria-label="Placement X" type="number" value={placement.x} onChange={e=>{const x=Math.trunc(e.currentTarget.valueAsNumber||0);setPlacement(p=>p?{...p,x}:p);}}/></label><label>Z <input aria-label="Placement Z" type="number" value={placement.z} onChange={e=>{const z=Math.trunc(e.currentTarget.valueAsNumber||0);setPlacement(p=>p?{...p,z}:p);}}/></label>
      <button aria-label="Move placement west" onClick={()=>setPlacement(p=>p?{...p,x:p.x-1}:p)}>X −</button><button aria-label="Move placement east" onClick={()=>setPlacement(p=>p?{...p,x:p.x+1}:p)}>X +</button><button aria-label="Move placement north" onClick={()=>setPlacement(p=>p?{...p,z:p.z-1}:p)}>Z −</button><button aria-label="Move placement south" onClick={()=>setPlacement(p=>p?{...p,z:p.z+1}:p)}>Z +</button></div>
      </div>
      <div className="valley-button-row">{(placement.kind==="home"||placement.kind==="furniture"||placement.kind==="move")&&<button onClick={()=>setPlacement(p=>p?{...p,rotation:((p.rotation+1)%4)as 0|1|2|3}:p)}>Rotate {placement.rotation*90}°</button>}<button className="valley-primary" disabled={!!placementError||pending} onClick={confirmPlacement}>{pending?"Checking…":"Confirm"}</button></div>
      <p className="valley-placement-summary" data-testid="placement-preview-summary">{placementCheck.description}</p>
      {placementError&&<p role="status" className="valley-placement-error">{placementError}</p>}
      {placement.kind!=="home"&&<button onClick={()=>{setPlacementDraft(placement);setPlacement(null);setCamera(old=>({...old,follow:true}));showFeedback({tone:"info",title:"Walk closer, then resume placement",detail:"Your chosen spot, rotation and item are kept."});}}>Walk closer</button>}
    </aside>}
    {ready&&panel==="interaction"&&service&&save&&<ValleyInteraction key={service.objectId} save={save} service={service} cursor={conversation} onCursor={setConversation} response={conversationResponse} onResponse={setConversationResponse} pending={transacting} onOpen={openContextAction} onEnd={closeMenus} onCommand={transact} panelRef={panelElement} onKeyDown={trap}/>}
    {ready&&panel==="craft"&&service&&save&&<ValleyCrafting save={save} service={service} selectedId={recipeId} onSelect={setRecipeId} quantity={quantity} onQuantity={setQuantity} pending={transacting} onCraft={(id,n)=>transact({type:"craft",recipeId:id,quantity:n})} onBack={back} panelRef={panelElement} onKeyDown={trap} message={transacting?"Starting your batch…":feedback&&feedback.id>menuEpoch.current?[message,feedback.detail].filter(Boolean).join(" · "):""}/>}
    {ready&&panel&&panel!=="interaction"&&panel!=="craft"&&save&&<ValleyMenu panel={panel} title={panelTitle} canGoBack={history.length>0} onBack={back} onClose={closeMenus} onOpen={next=>open(next)} onSection={next=>{menuEpoch.current=feedbackSequence.current;setMenu(current=>({...current,panel:next}));}} contextual={!!service} sections={menuSections} panelRef={panelElement} onKeyDown={trap} message={feedback&&feedback.id>menuEpoch.current?[message,feedback.detail].filter(Boolean).join(" · "):""}>
      {service&&<p className="valley-service-name">{service.name}</p>}
      {panel==="inventory"&&<>
        {storageAccess?<>{quantityField}<p>Shared storage for your tent, cottage and caravan chest.</p></>:<p>Use your carried items here. Open your tent, cottage or the caravan chest to store belongings.</p>}
        <div className="valley-columns" data-storage-access={storageAccess}><section><h3>Carried</h3>{save.chapter.player.inventory.length?save.chapter.player.inventory.map((i,index)=><div className="valley-item" key={`${i.itemId}-${index}`}><span>{name(i.itemId)} ×{i.quantity}</span><div className="valley-button-row">{!storageAccess&&ITEMS[i.itemId]?.heals&&<button onClick={()=>command({type:"eat",itemId:i.itemId})}>Eat</button>}{!storageAccess&&ITEMS[i.itemId]?.slot&&<button onClick={()=>command({type:"equip",itemId:i.itemId})}>Equip</button>}{storageAccess&&<button disabled={transacting} onClick={()=>command({type:"store",itemId:i.itemId,quantity:Math.min(quantity,i.quantity)})}>Store {Math.min(quantity,i.quantity)}</button>}</div></div>):<p>Backpack empty.</p>}</section>
        {storageAccess&&<section><h3>Connected storage</h3>{save.chapter.bank.length?save.chapter.bank.map((i,index)=><div className="valley-item" key={`${i.itemId}-${index}`}><span>{name(i.itemId)} ×{i.quantity}</span><button onClick={()=>command({type:"withdraw",itemId:i.itemId,quantity:Math.min(quantity,i.quantity)})}>Take {Math.min(quantity,i.quantity)}</button></div>):<p>Storage empty.</p>}</section>}</div>
        {!storageAccess&&<><h3>Equipped</h3>{Object.entries(save.chapter.player.equipment).map(([slot,itemId])=>itemId&&<div className="valley-item" key={slot}><span>{slot}: {name(itemId)}</span><button onClick={()=>command({type:"unequip",slot:slot as EquipmentSlot})}>Unequip</button></div>)}</>}
      </>}
      {panel==="home"&&<>
        {!save.valley.home?<><p>Choose a site for your free tent. The preview also reserves your future cottage.</p><button className="valley-primary" onClick={()=>startPlacement("home",{x:32,z:154})}>Place free tent</button></>:accountAccess?<>
          <h3>Royal account</h3><p>Cottage account: {save.valley.paid} / {FIRST_BILL} coins · {coins} coins available.</p>
          {save.valley.paid<FIRST_BILL?<><div className="valley-quantity"><label htmlFor="valley-payment">Payment</label><button aria-label="Decrease payment" disabled={paymentAmount<=1} onClick={()=>setPayment(Math.max(1,paymentAmount-1))}>−</button><input id="valley-payment" aria-label="Cottage payment" type="number" min={1} max={FIRST_BILL-save.valley.paid} value={paymentAmount} onChange={e=>setPayment(amount(e.currentTarget.valueAsNumber))}/><button aria-label="Increase payment" disabled={paymentAmount>=FIRST_BILL-save.valley.paid} onClick={()=>setPayment(Math.min(FIRST_BILL-save.valley.paid,paymentAmount+1))}>+</button></div><div className="valley-button-row"><button onClick={()=>command({type:"pay",amount:paymentAmount})}>Pay {paymentAmount} coins</button><button onClick={()=>command({type:"pay",amount:FIRST_BILL-save.valley.paid})}>Pay remaining {FIRST_BILL-save.valley.paid}</button></div><p>No deadline or interest. Full payment includes the cottage and its 90 active minutes of construction.</p></>:<><progress aria-label="Cottage construction" max={COTTAGE_TICKS} value={save.valley.cottageTicks}/><p>{complete?"Your cottage is ready.":`${time(COTTAGE_TICKS-save.valley.cottageTicks)} active construction remaining.`}</p></>}
          {service?.kind==="home"&&complete&&!save.valley.home.tentPacked&&<button onClick={()=>command({type:"pack-tent"},ok=>{if(ok)closeMenus();})}>Pack the tent</button>}
        </>:<p>Place what you carry or move furnishings. Speak to Rowan about your cottage account.</p>}
        {!accountOnly&&<><h3>Furnishings</h3><div className="valley-button-row">{FURNITURE.filter(id=>itemCount(save.chapter.player.inventory,`valley-${id}`)>0).map(id=><button key={id} onClick={()=>startPlacement("furniture",{itemId:id})}>Place {id} ({itemCount(save.chapter.player.inventory,`valley-${id}`)})</button>)}<button onClick={()=>open("land")}>Ground & garden</button>{service?.kind==="home"&&complete&&save.valley.home&&!save.valley.home.tentPacked&&<button onClick={()=>command({type:"pack-tent"},ok=>{if(ok)closeMenus();})}>Pack the tent</button>}</div>{!FURNITURE.some(id=>itemCount(save.chapter.player.inventory,`valley-${id}`)>0)&&<p>No furnishings in your backpack. Use a workbench to craft one.</p>}
          {save.valley.furniture.map(f=><div className="valley-item" key={f.id}><span>{f.itemId} · {f.x}, {f.z}</span><button onClick={()=>startPlacement("move",{id:f.id,itemId:f.itemId,x:f.x,z:f.z,rotation:f.rotation})}>Move / rotate</button></div>)}
          <details><summary>Future royal grants</summary><div className="valley-grants">{FUTURE_GRANTS.map(grant=><article className="valley-grant" key={grant.id}><header><h4>{grant.title}</h4><span>Later</span></header><p>{grant.benefit}</p></article>)}</div></details>
        </>}
      </>}
      {panel==="trade"&&<><p>Carried coins: {itemCount(save.chapter.player.inventory,"coins")}</p><div className="valley-selection-layout">
        <div className="valley-choice-list valley-goods-list" role="group" aria-label="Goods">{VALLEY_STOCK.map(choice=><button key={choice.itemId} aria-pressed={choice.itemId===stock.itemId} data-stock-today={todayStock.has(choice.itemId)} onClick={()=>setTradeItem(choice.itemId)}><ValleyItemPreview itemId={choice.itemId}/><span>{name(choice.itemId)}</span></button>)}</div>
        <article className="valley-card valley-selection-detail valley-trade" data-testid="trade-detail" data-stock-today={todayStock.has(stock.itemId)}><h3>{name(stock.itemId)}</h3><p>Have {itemCount(save.chapter.player.inventory,stock.itemId)} · Buy {stock.buy} / sell {stock.sell} coins each</p>{quantityField}
          {stock.requiresCottage&&!complete&&<p>Available after your cottage is ready.</p>}{!todayStock.has(stock.itemId)&&<p>Not in today's display. You can still sell what you carry.</p>}
          <div className="valley-button-row"><button disabled={transacting||(stock.requiresCottage&&!complete)||!todayStock.has(stock.itemId)} onClick={()=>transact({type:"buy",itemId:stock.itemId,quantity})}>Buy {quantity} · {stock.buy*quantity} coins</button><button disabled={transacting||(stock.requiresCottage&&!complete)||itemCount(save.chapter.player.inventory,stock.itemId)<quantity} onClick={()=>transact({type:"sell",itemId:stock.itemId,quantity})}>Sell {quantity} · {stock.sell*quantity} coins</button></div>
        </article></div></>}
      {panel==="projects"&&<>
        {service?.kind!=="forge"&&service?.kind!=="planning"&&<><h3>Supply commissions</h3><p>Bring the carried materials here to complete an order.</p>{VALLEY_COMMISSIONS.filter(order=>(visitors.find(v=>v.id===service?.visitorId)??visitors[0])?.offers.some(offer=>offer.id===order.id)).map(order=>{
          const available=(visitors.find(v=>v.id===service?.visitorId)??visitors[0])?.offers.some(o=>o.id===order.id);
          return <article className="valley-card" key={order.id}><h3>{order.name} {order.daily&&<small>Daily</small>}</h3><p>{order.inputs.map(i=>`${name(i.itemId)} ${itemCount(save.chapter.player.inventory,i.itemId)}/${i.quantity}`).join(" · ")} · Pays {order.coins} coins</p><button disabled={transacting||!available||order.inputs.some(i=>itemCount(save.chapter.player.inventory,i.itemId)<i.quantity)} onClick={()=>transact({type:"commission",id:order.id})}>{available?"Deliver order":"Complete / unavailable today"}</button></article>;
        })}</>}
        {(service?.kind==="forge"||service?.kind==="planning")&&<><h3>Optional public forge</h3><p>Logs {save.valley.forge.logs}/12 · Bronze bars {save.valley.forge.bars}/2</p><progress aria-label="Public forge construction" max={FORGE_TICKS} value={save.valley.forge.ticks}/><p>{!complete?"Finish your cottage to begin this optional project.":save.valley.forge.ticks>=FORGE_TICKS?"The public forge is ready.":"Deliver the actual materials here; the build then takes 18 active minutes."}</p>
        {service?.kind==="forge"?<>{quantityField}<div className="valley-button-row"><button disabled={!complete||save.valley.forge.logs>=12} onClick={()=>command({type:"forge-deliver",itemId:"logs",quantity})}>Deliver {quantity} logs</button><button disabled={!complete||save.valley.forge.bars>=2} onClick={()=>command({type:"forge-deliver",itemId:"bronze-bar",quantity})}>Deliver {quantity} bronze bars</button></div></>:<><p>Interact with the project board at the forge site to deliver materials.</p>{locationButton("forge project board",70,177)}</>}</>}
      </>}
      {panel==="land"&&<><p>Ground edits are limited to ±0.5 metres on owned land, with four-tread stairs. Routes, water and home entrances are protected.</p><div className="valley-land-grid">{(["path","grass","raise","lower","stairs-north","stairs-east","stairs-south","stairs-west"]as const).map(operation=><button key={operation} onClick={()=>startPlacement("terrain",{operation})}>{operation.replace("-"," ")}</button>)}<button disabled={!save.valley.undo.length} onClick={()=>command({type:"undo-terrain"})}>Undo last ground edit</button></div><h3>Planting</h3><div className="valley-button-row"><button onClick={()=>startPlacement("plant",{plant:"flowers"})}>Plant flower seeds</button><button onClick={()=>startPlacement("plant",{plant:"sapling"})}>Plant young sapling</button></div><p>Carry the seeds or sapling and stand near the chosen spot. Lift existing plantings to reclaim their original seed or sapling, then move them elsewhere.</p>{save.valley.plants.map(plant=><div className="valley-item" key={plant.id}><span>{plant.kind} · {plant.x}, {plant.z}</span><button onClick={()=>command({type:"lift-plant",id:plant.id})}>Lift planting</button></div>)}</>}
      {panel==="visitor"&&<>{visitors.filter(visitor=>visitor.id===service?.visitorId).map(visitor=><article className="valley-card" key={visitor.id} data-selected={visitor.id===visitorId}><h3>{visitor.name} · {visitor.role}</h3><p>{visitor.dialogue}</p><div className="valley-button-row"><button onClick={()=>{setVisitorId(visitor.id);command({type:"talk-visitor",id:visitor.id});}}>Talk to {visitor.name}</button>{locationButton(visitor.name,visitor.x,visitor.z)}{visitor.id==="builder"&&<button onClick={()=>command({type:"daily-help"})}>Ask for today's four logs</button>}</div></article>)}</>}
      {panel==="journal"&&onboarding&&<><span className="valley-eyebrow">Chapter {onboarding.day}</span><h3>{onboarding.title}</h3><p>{onboarding.body}</p>{onboarding.help&&<p>{onboarding.help}</p>}<ul className="valley-steps">{onboarding.steps.map(step=><li key={step.id}><span>{step.complete?"✓":"○"} {step.label}</span>{!step.complete&&<button onClick={()=>command({type:"pin-goal",goal:step.label})}>Pin goal</button>}</li>)}</ul><p>Current goal: {save.valley.goal||onboarding.nextGoal}</p><button onClick={()=>command({type:"pin-goal",goal:onboarding.nextGoal})}>Pin next suggested goal</button>{onboarding.day===3&&<section className="valley-directions"><h3>Choose your next direction</h3><p>Pin a direction as your current goal.</p><div className="valley-button-row">{VALLEY_DIRECTIONS.map(direction=><button key={direction.id} data-direction={direction.id} aria-pressed={save.valley.goal===direction.goal} onClick={()=>command({type:"pin-goal",goal:direction.goal})}>{direction.label}</button>)}</div></section>}<h3>Places in your valley</h3><div className="valley-button-row">{locationButton("timber",25,139)}{locationButton("pond",36,150)}{locationButton("ore",83,152)}{locationButton("workbench",69,139)}{locationButton("caravan",74,140)}{locationButton("Rowan",51,141)}</div><p>Find pins a destination. Click or tap your way there; the camera follows you.</p></>}
      {panel==="settings"&&<><h3>Controls</h3><div className="valley-button-row valley-settings-modes" role="group" aria-label="Settings strike mode"><button aria-pressed={tool} onClick={()=>setTool(true)}>Use tool</button><button aria-pressed={!tool} onClick={()=>setTool(false)}>Use weapon</button></div><h3>Mouse & touch</h3><p>Click or tap ground to walk. Select a tree, rock, fishing spot, person or station to walk over and interact. Right-click or hold for options. Select new ground or use Stop to cancel work. Pinch or scroll to zoom.</p><h3>Camera</h3><div className="valley-land-grid"><button onClick={()=>setCamera(old=>({...old,zoom:Math.max(.65,old.zoom/1.2)}))}>Zoom out</button><button onClick={()=>setCamera(old=>({...old,zoom:Math.min(3,old.zoom*1.2)}))}>Zoom in</button></div><h3>Save & archive</h3><div className="valley-land-grid"><button onClick={()=>post({type:"save"})}>Save on this device</button><button onClick={()=>post({type:"export"})}>Export valley</button><button onClick={()=>fileInput.current?.click()}>Import valley file</button></div><input ref={fileInput} className="valley-file-input" hidden type="file" accept="application/json,.json" aria-label="Import valley archive" onChange={async e=>{const file=e.currentTarget.files?.[0];if(!file)return;try{const value:unknown=JSON.parse(await file.text());post({type:"import",value});setPlacementDraft(null);setDestination(null);}catch{showFeedback({tone:"warning",title:"That file is not readable JSON."});}e.target.value="";}}/>
      <details><summary>Start a new valley</summary><p>This replaces the active valley. Export your current valley first if you want to keep it.</p><label><input type="checkbox" checked={resetConfirm} onChange={e=>setResetConfirm(e.currentTarget.checked)}/> I have kept any archive I need</label><button disabled={!resetConfirm} onClick={()=>{post({type:"reset"});setResetConfirm(false);setPanel(null);setPlacement(null);setPlacementDraft(null);setDestination(null);}}>Confirm new valley</button></details>
      <a className="valley-earlier-journey" href="?chapter=legacy">Earlier journey</a><h3>Controls</h3><p>Click / tap: walk or approach a target. Right-click / hold: options. Selected resources and foes repeat their action until finished or cancelled. WASD / left stick: direct movement. RT: one strike per press. Space / LT: hold guard. Touch guard appears in the wilderness. E / A: use nearby things. Gamepad Y: switch tool / weapon. I: backpack. Menu / Start: game menu. B / X: ground tools. Escape / controller B: back one screen. Menu / Start again: resume.</p><p>The camera always follows you, gently looking ahead while you move. Wheel or pinch changes zoom. Select a target to approach it. Menus open only once you arrive in range. D-pad and A navigate panels. Placement also has X/Z fields and step buttons.</p><p>All gameplay and saving run on this device. The valley needs no paid service.</p></>}
      {panel==="journal"&&<section className="valley-activity" aria-label="Recent activity"><h3>Recent activity</h3><p>Your last ten interaction results, including gathered items, XP and completed work.</p>{recent.length?<ol>{recent.map(entry=><li key={entry.id} data-tone={entry.tone}><strong>{entry.title}</strong>{entry.detail&&<span>{entry.detail}</span>}</li>)}</ol>:<p>No activity yet this visit.</p>}</section>}
    </ValleyMenu>}
  </main>;
}
