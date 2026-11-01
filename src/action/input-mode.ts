export type ActionInputMode="keyboard"|"touch"|"controller";
/** Last intentional device wins; connecting a pad or resting-stick drift is not use. */
export class InputModeTracker {
  mode:ActionInputMode;
  private touchAvailable:boolean;
  private buttons:boolean[]=[];
  private axes:number[]=[];
  constructor(touchAvailable:boolean){this.touchAvailable=touchAvailable;this.mode=touchAvailable?"touch":"keyboard";}
  get touchControls():boolean{return this.touchAvailable&&this.mode==="touch";}
  use(mode:ActionInputMode):boolean{if(mode==="touch")this.touchAvailable=true;const changed=this.mode!==mode;this.mode=mode;return changed;}
  observePad(buttons:readonly boolean[],axes:readonly number[]):boolean{
    const next=axes.slice(0,4).map(v=>Number.isFinite(v)?v:0);
    const activity=buttons.some((pressed,i)=>pressed&&!this.buttons[i])||next.some((value,i)=>Math.abs(value)>.25&&Math.abs(value-(this.axes[i]??0))>.08);
    this.buttons=[...buttons];this.axes=next;return activity;
  }
  disconnect():boolean{this.buttons=[];this.axes=[];return this.mode==="controller"?this.use(this.touchAvailable?"touch":"keyboard"):false;}
}
