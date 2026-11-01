import {useLayoutEffect,useRef} from "react";
import type {KeyboardEventHandler,RefObject} from "react";
import type {ValleyCommand,ValleySave,ValleyService,ValleyServicePanel} from "./contracts";
import {conversationTurn} from "./conversation";
import type {ConversationCursor} from "./conversation";
import {serviceSections} from "./services";
import "./interaction.css";

interface Props {
  save:ValleySave; service:ValleyService; cursor:ConversationCursor; onCursor(cursor:ConversationCursor):void;
  response:string; onResponse(response:string):void; pending:boolean;
  onOpen(panel:ValleyServicePanel):void; onEnd():void;
  onCommand(command:ValleyCommand,done:(ok:boolean,message?:string)=>void):void;
  panelRef:RefObject<HTMLElement|null>; onKeyDown:KeyboardEventHandler<HTMLElement>;
}
export function ValleyInteraction({save,service,cursor,onCursor,response,onResponse,pending:busy,onOpen,onEnd,onCommand,panelRef,onKeyDown}:Props){
  const body=useRef<HTMLDivElement>(null),wasMounted=useRef(false);
  const visitor=service.kind==="visitor",turn=visitor?conversationTurn(save,service.visitorId??"builder",cursor,Date.now(),response):null;
  useLayoutEffect(()=>{if(wasMounted.current)body.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();wasMounted.current=true;},[cursor]);
  const speaker=service.visitorId==="builder"?"Rowan":service.visitorId==="merchant"?"Pella":service.visitorId==="smith"?"Garrick":service.name;
  return <div className="valley-interaction-layer">
    <section className="valley-interaction" role="dialog" aria-modal="true" aria-label={visitor?`Conversation with ${speaker}`:service.name} data-menu-panel="interaction" data-interaction-kind={visitor?"conversation":"object"} ref={panelRef} onKeyDown={onKeyDown}>
      <div ref={body}>
      {visitor&&turn&&("line"in turn?<div className="valley-speech"><span className="valley-speaker">{speaker}</span><p aria-live="polite">{turn.line}</p><div className="valley-speech-advance"><button aria-label="Continue conversation" onClick={()=>turn.next==="end"?onEnd():onCursor(turn.next)}>›</button></div></div>:<div className="valley-replies" aria-label="Your reply">{turn.replies.map(reply=><button key={reply.label} disabled={busy||reply.disabled} onClick={()=>{
        if(reply.panel){onOpen(reply.panel);return;}if(reply.command){onCommand(reply.command,(ok,message)=>{onResponse(ok?reply.success??message??"Thank you!":message??"Let’s try that again another time.");onCursor("response");});return;}if(reply.next)onCursor(reply.next);
      }}>{reply.label}</button>)}{busy&&<p role="status">One moment…</p>}</div>)}
      {!visitor&&<div className="valley-speech valley-object-prompt"><span className="valley-speaker">{service.name}</span><p>{service.kind==="workbench"?"What would you like to make?":service.kind==="furnace"?"The coals are warm. Smelt something?":service.kind==="range"?"Ready to cook something?":service.kind==="caravan"?"Have a look at today’s supplies.":service.kind==="home"?"A place for you and your belongings.":"What would you like to work on?"}</p><div className="valley-object-actions">{serviceSections(service).map(section=><button className="valley-interaction-primary" key={section.panel} onClick={()=>onOpen(section.panel)}>{section.panel==="craft"?(service.kind==="furnace"?"Smelt something":service.kind==="range"?"Cook something":"Craft something"):section.label}</button>)}<button onClick={onEnd}>Step away</button></div></div>}
      </div>
    </section>
  </div>;
}
