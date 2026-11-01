import {describe,it,expect} from 'vitest';
import {fitInteractionCamera,interactionSafeArea,InteractionCameraTransition,projectInteractionPoint,type InteractionCameraFocus,type InteractionCameraPose} from '../src/render/interaction-camera';

const base:InteractionCameraPose={x:48,y:.4,z:140,span:18,pitch:.58,directionX:32/Math.hypot(32,45),directionZ:45/Math.hypot(32,45)};
const focus:InteractionCameraFocus={player:{x:51,z:143},target:{x:51,z:141},safeArea:{left:0,top:0,right:1,bottom:.67}};
describe('interaction camera composition',()=>{
  for(const aspect of[390/844,16/9])for(const perspective of[false,true])it(`fits the entire workbench envelope ${aspect} ${perspective}`,()=>{
    const request={...focus,player:{x:69,z:140},target:{x:69.5,z:139},targetSize:{width:2.4,depth:2.4,height:1.6},safeArea:aspect>1?{left:0,top:0,right:.62,bottom:1}:focus.safeArea};
    const pose=fitInteractionCamera(request,aspect);
    for(const x of[-1.2,1.2])for(const z of[-1.2,1.2])for(const y of[0,1.6]){
      const p=projectInteractionPoint({x:request.target.x+x,y,z:request.target.z+z},pose,aspect,perspective);
      expect(p.x).toBeGreaterThanOrEqual(request.safeArea.left);expect(p.x).toBeLessThanOrEqual(request.safeArea.right);expect(p.y).toBeGreaterThanOrEqual(request.safeArea.top);expect(p.y).toBeLessThanOrEqual(request.safeArea.bottom);
    }
  });
  for(const perspective of[false,true])for(const aspect of[320/568,390/844,16/9])for(const pair of[[0,2],[2,0],[-2,1],[0,0]])it(`fits two grounded silhouettes ${perspective?'perspective':'ortho'} ${aspect.toFixed(2)} ${pair}`,()=>{
    const request={...focus,target:{x:focus.player.x+pair[0],z:focus.player.z+pair[1]},safeArea:aspect>1?{left:0,top:0,right:.62,bottom:1}:focus.safeArea};
    const height=(x:number)=>x>52?.5:0;
    const pose=fitInteractionCamera(request,aspect,height);
    for(const anchor of[request.player,request.target])for(const x of[-.58,.58])for(const z of[-.35,.35])for(const y of[0,1.3]){
      const point=projectInteractionPoint({x:anchor.x+x,y:height(anchor.x)+y,z:anchor.z+z},pose,aspect,perspective);
      expect(point.x).toBeGreaterThanOrEqual(request.safeArea.left);expect(point.x).toBeLessThanOrEqual(request.safeArea.right);
      expect(point.y).toBeGreaterThanOrEqual(request.safeArea.top);expect(point.y).toBeLessThanOrEqual(request.safeArea.bottom);
    }
  });
  it('normalizes invalid rectangles and coordinates without introducing NaN',()=>{
    expect(interactionSafeArea({left:.9,top:NaN,right:.2,bottom:1})).toEqual({left:0,top:0,right:1,bottom:1});
    const pose=fitInteractionCamera({...focus,player:{x:NaN,z:Infinity},target:{x:0,z:0}},NaN,()=>NaN);
    expect(Object.values(pose).every(Number.isFinite)).toBe(true);
  });
});
describe('interaction camera transitions',()=>{
  it('returns the original pose by identity until interaction is requested',()=>{
    const transition=new InteractionCameraTransition();expect(transition.update(base,undefined,.5,0)).toBe(base);expect(transition.status).toBe('none');
  });
  it('enters, closes and restores the exact caller camera without mutating it',()=>{
    const transition=new InteractionCameraTransition(),saved=structuredClone(base);
    expect(transition.update(base,focus,.5,0)).toEqual(base);
    const halfway=transition.update(base,focus,.5,300);expect(halfway.span).toBeLessThan(base.span);expect(transition.status).toBe('blending');
    transition.update(base,focus,.5,600);expect(transition.status).toBe('active');
    transition.update(base,undefined,.5,601);expect(transition.status).toBe('blending');
    expect(transition.update(base,undefined,.5,1201)).toBe(base);expect(transition.status).toBe('none');expect(base).toEqual(saved);
  });
  it('retargets orientation or rapidly reopened interaction from the last drawn pose',()=>{
    const transition=new InteractionCameraTransition();transition.update(base,focus,.5,0);const entry=transition.update(base,focus,.5,220);
    expect(transition.update(base,undefined,.5,221)).toEqual(entry);const leaving=transition.update(base,undefined,.5,400);
    expect(transition.update(base,focus,.5,401)).toEqual(leaving);const entering=transition.update(base,focus,.5,500);
    expect(transition.update(base,{...focus,safeArea:{left:0,top:0,right:.62,bottom:1}},16/9,501)).toEqual(entering);
  });
  it('reduced motion applies the focused view and restores immediately',()=>{
    const transition=new InteractionCameraTransition();const result=transition.update(base,{...focus,reducedMotion:true},.5,0);
    expect(result).toEqual(fitInteractionCamera(focus,.5));expect(transition.status).toBe('active');
    expect(transition.update(base,undefined,.5,1)).toBe(base);expect(transition.status).toBe('none');
  });
});
