import * as THREE from "three";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import type { VisualSettings } from "./visual-settings";
import { lensToScene, lensToScreen, MAX_LENS_DISTORTION } from "./lens-distortion";

const vertexShader = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const raysShader = `
precision highp sampler2DShadow;
uniform sampler2D depth;uniform sampler2DShadow lightDepth;
uniform mat4 inverseProjection,cameraWorld,lightMatrix;
uniform vec2 curveCenter;uniform float curvature,shadowBias,viewRange,cameraFar;
varying vec2 vUv;
void main(){
 vec4 endView=inverseProjection*vec4(vUv*2.-1.,texture2D(depth,vUv).r*2.-1.,1.);endView/=endView.w;
 vec4 nearView=inverseProjection*vec4(vUv*2.-1.,-1.,1.);nearView/=nearView.w;
 vec3 start=(cameraWorld*nearView).xyz,end=(cameraWorld*endView).xyz;
 vec3 delta=end-start;float lengthRay=length(delta);vec3 direction=delta/max(lengthRay,.0001);
 float horizon=smoothstep(viewRange*.86,viewRange*.98,distance(end.xz,curveCenter));
 // Clip both geometry and sky rays to the same logical horizon cylinder.
 vec2 offset=start.xz-curveCenter;float horizontal=dot(direction.xz,direction.xz);
 float along=dot(offset,direction.xz),discriminant=along*along-horizontal*(dot(offset,offset)-viewRange*viewRange);
 float entry=0.,exitDistance=lengthRay;
 if(horizontal>.00001){
  if(discriminant<0.){gl_FragColor=vec4(0.,0.,0.,1.);return;}
  float root=sqrt(discriminant);entry=max(0.,(-along-root)/horizontal);exitDistance=max(0.,(-along+root)/horizontal);
 }
 // Restrict integration to the low world-space atmosphere, in front of scene depth.
 float a=entry,b=min(mix(lengthRay,exitDistance,horizon),exitDistance);
 if(abs(direction.y)>.00001){
  float lower=(-curvature*viewRange*viewRange-.1-start.y)/direction.y,upper=(7.-start.y)/direction.y;
  a=max(a,min(lower,upper));b=min(b,max(lower,upper));
 }
 float stepLength=max(0.,b-a)/24.,sum=0.,transmission=1.;
 for(int i=0;i<24;i++){
  vec3 point=start+direction*(a+(float(i)+.5)*stepLength);
  float bend=dot(point.xz-curveCenter,normalize(vec2(32.,45.)));
  point.y+=curvature*bend*bend;
  float density=exp(-max(0.,point.y)*.65)*smoothstep(.02,.25,point.y)*(1.-smoothstep(5.,6.,point.y));
  density*=1.-smoothstep(viewRange*.8,viewRange,distance(point.xz,curveCenter));
  vec4 projected=lightMatrix*vec4(point,1.);vec3 uv=projected.xyz/projected.w;
  float edge=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));
  float inside=smoothstep(0.,.035,edge)*step(0.,uv.z)*step(uv.z,1.);
  float visible=texture(lightDepth,vec3(clamp(uv.xy,vec2(0.),vec2(1.)),uv.z+shadowBias));
  float extinction=1.-exp(-density*stepLength*.065);
  sum+=transmission*extinction*visible*inside;transmission*=1.-extinction;
 }
 gl_FragColor=vec4(vec3(sum),mix(clamp(-endView.z/cameraFar,0.,1.),1.,horizon));
}`;
/** Shafts depend on fog and world shadows, never the source's screen position. */
export const fogShaftsEnabled = (visual: Readonly<VisualSettings>, overview: boolean, shadows: boolean) => !overview && visual.fogEnabled && visual.lightRays > 0 && shadows;
const blurShader = `
uniform sampler2D source;uniform vec2 stepSize;uniform float extract;
varying vec2 vUv;
vec3 sampleLight(vec2 uv){vec3 c=texture2D(source,uv).rgb;float l=max(c.r,max(c.g,c.b));return c*mix(1.,smoothstep(.9,1.8,l),extract);}
void main(){vec3 c=sampleLight(vUv)*.227027;
c+=(sampleLight(vUv+stepSize*1.384615)+sampleLight(vUv-stepSize*1.384615))*.316216;
c+=(sampleLight(vUv+stepSize*3.230769)+sampleLight(vUv-stepSize*3.230769))*.070270;
gl_FragColor=vec4(c,1.);}`;
const compositeShader = `
#include <packing>
${FXAAShader.fragmentShader.slice(FXAAShader.fragmentShader.indexOf("#define EDGE_STEP_COUNT"), FXAAShader.fragmentShader.lastIndexOf("void main()"))}
uniform sampler2D source,depth,bloom,rays;
uniform vec3 rayColor;uniform float rayPower;
uniform vec2 rayTexel;uniform float rayOrthographic;
uniform mat4 rayInverseProjection,rayCameraWorld;uniform vec2 rayCenter;uniform float rayHorizon;
uniform vec2 pixelSize,aaPixelSize;
uniform float bloomStrength,aberration,dof,focusDistance,cameraNear,cameraFar,colorBalance;
uniform float clearBackground;
uniform float lensDistortion,lensAspect;
varying vec2 vUv;
float shaftAmount(vec2 uv){
 if(rayPower<=0.)return 0.;
 float z=texture2D(depth,uv).r;
 float distance=rayOrthographic>.5?-orthographicDepthToViewZ(z,cameraNear,cameraFar):-perspectiveDepthToViewZ(z,cameraNear,cameraFar);
 if(rayHorizon>0.){
  vec4 hit=rayInverseProjection*vec4(uv*2.-1.,z*2.-1.,1.);hit/=hit.w;
  float horizon=smoothstep(rayHorizon*.86,rayHorizon*.98,length((rayCameraWorld*hit).xz-rayCenter));
  distance=mix(distance,cameraFar,horizon);
 }
 float sum=0.,weights=0.;
 for(int i=0;i<4;i++){
  vec2 offset=vec2(mod(float(i),2.)-.5,floor(float(i)/2.)-.5)*rayTexel;
  vec4 sampleRay=texture2D(rays,uv+offset);
  float error=abs(sampleRay.a*cameraFar-distance)/max(1.,distance*.03);
  float weight=exp(-error*error);sum+=sampleRay.r*weight;weights+=weight;
 }
 return sum/max(weights,.0001);
}
float blurRadius(vec2 uv){
 float z=texture2D(depth,uv).x;
 float distance=-perspectiveDepthToViewZ(z,cameraNear,cameraFar);
 float band=max(2.,focusDistance*.12);
 // Broad sharp focus, then a stronger distant circle of confusion. Keep the
 // foreground much gentler so nearby units and ground contacts stay readable.
 float farBlur=clamp((distance-focusDistance-band)/max(distance,1.)*2.5,0.,1.);
 float nearBlur=clamp((focusDistance-distance-band)/max(focusDistance,1.),0.,1.)*.18;
 return dof*28.*max(farBlur,nearBlur);
}
void main(){
 vec2 p=(vUv-.5)*2.;
 float r2=dot(p*vec2(lensAspect,1.),p*vec2(lensAspect,1.))/(lensAspect*lensAspect+1.);
 float k=lensDistortion*${MAX_LENS_DISTORTION.toFixed(4)};
 vec2 sceneUv=.5+.5*p*(1.+k*r2)/(1.+k);
 vec3 color=ApplyFXAA(source,aaPixelSize,sceneUv).rgb;
 float radius=blurRadius(sceneUv);
 vec2 radial=(sceneUv-.5)*2.;
 vec2 shift=radial*dot(radial,radial)*pixelSize*aberration*.5;
 // Subpixel fringing belongs to the sharp image, before optical defocus.
 if(aberration>0.){
  color.r+=texture2D(source,sceneUv+shift).r-texture2D(source,sceneUv).r;
  color.b+=texture2D(source,sceneUv-shift).b-texture2D(source,sceneUv).b;
 }
 color+=shaftAmount(sceneUv)*rayColor*rayPower;
 if(radius>.01){
  vec3 sum=vec3(0.);float weight=0.;
  // Golden-angle samples fill a circular aperture instead of an eight-point
  // ring. Gather in HDR so distant bright lights retain round bokeh highlights.
  for(int i=0;i<32;i++){
   float apertureRadius=sqrt((float(i)+.5)/32.);
   float angle=float(i)*2.39996323;
   vec2 uv=sceneUv+vec2(cos(angle),sin(angle))*pixelSize*radius*apertureRadius;
   float sampleRadius=blurRadius(uv);
   vec3 sampleColor=texture2D(source,uv).rgb;
   // Fog is part of the scene: gather it through the same aperture as geometry.
   if(rayPower>0.)sampleColor+=texture2D(rays,uv).rrr*rayColor*rayPower;
   // Reject sharp foreground samples at depth boundaries.
   float w=clamp((sampleRadius+.1)/(radius+.1),0.,1.);
   float highlight=max(sampleColor.r,max(sampleColor.g,sampleColor.b));
   w*=1.+min(2.,max(0.,highlight-1.))*.3;
   sum+=sampleColor*w;weight+=w;
  }
  color=mix(color,sum/max(weight,.0001),smoothstep(.25,1.,radius));
 }
 color+=texture2D(bloom,sceneUv).rgb*bloomStrength;
 {
  float light=smoothstep(.1,1.2,dot(color,vec3(.2126,.7152,.0722)));
  vec3 balance=mix(vec3(.96,1.0,1.045),vec3(1.025,1.0,.975),light);
  color*=mix(vec3(1.0),balance,colorBalance);
 }
 gl_FragColor=vec4(color,1.);
 if(clearBackground<.5 || texture2D(depth,sceneUv).x<.999999){
  #include <tonemapping_fragment>
 }
 #include <colorspace_fragment>
}`;

/** HDR scene + half-size separable glow + one display pass. UI stays sharp. */
export class PostProcessing {
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private target: THREE.WebGLRenderTarget;
  private glowA: THREE.WebGLRenderTarget;
  private glowB: THREE.WebGLRenderTarget;
  private raysTarget: THREE.WebGLRenderTarget;
  private raysMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader: raysShader, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { depth: { value: null }, lightDepth: { value: null }, inverseProjection: { value: new THREE.Matrix4() }, cameraWorld: { value: new THREE.Matrix4() }, lightMatrix: { value: new THREE.Matrix4() },
      curveCenter: { value: new THREE.Vector2() }, curvature: { value: 0 }, shadowBias: { value: 0 }, viewRange: { value: 80 }, cameraFar: { value: 650 } } });
  private blur = new THREE.ShaderMaterial({ vertexShader, fragmentShader: blurShader, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { source: { value: null }, stepSize: { value: new THREE.Vector2() }, extract: { value: 1 } } });
  private composite = new THREE.ShaderMaterial({ vertexShader, fragmentShader: compositeShader, depthTest: false, depthWrite: false,
    uniforms: { source: { value: null }, depth: { value: null }, bloom: { value: null }, pixelSize: { value: new THREE.Vector2() }, aaPixelSize: { value: new THREE.Vector2() }, clearBackground: { value: 0 },
      bloomStrength: { value: 0 }, aberration: { value: 0 }, lensDistortion: { value: 0 }, lensAspect: { value: 1 }, dof: { value: 0 }, focusDistance: { value: 1 }, cameraNear: { value: .1 }, cameraFar: { value: 650 }, colorBalance: { value: 0 } } });
  private size = new THREE.Vector2();
  readonly stats = { passes: 0, width: 1, height: 1, rayPasses: 0 };
  screenToScene<T extends { x: number; y: number }>(point: T): T {
    return lensToScene(point, this.composite.uniforms.lensDistortion.value, this.composite.uniforms.lensAspect.value);
  }
  sceneToScreen<T extends { x: number; y: number }>(point: T): T {
    return lensToScreen(point, this.composite.uniforms.lensDistortion.value, this.composite.uniforms.lensAspect.value);
  }
  constructor(renderer: THREE.WebGLRenderer) {
    const type = renderer.extensions.has("EXT_color_buffer_float") ? THREE.HalfFloatType : THREE.UnsignedByteType;
    // Fold Three's FXAA into the display pass. Multisampled HDR+depth targets
    // would multiply full-resolution memory, especially at high display density.
    this.target = new THREE.WebGLRenderTarget(1, 1, { type, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
    this.target.texture.name = "world-hdr";
    this.glowA = new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: false });
    this.glowB = this.glowA.clone();
    this.raysTarget = this.glowA.clone(); this.raysTarget.texture.name = "quarter-light-rays";
    Object.assign(this.composite.uniforms, { rays: { value: this.raysTarget.texture }, rayColor: { value: new THREE.Color() }, rayPower: { value: 0 }, rayTexel: { value: new THREE.Vector2() }, rayOrthographic: { value: 0 },
      rayInverseProjection: this.raysMaterial.uniforms.inverseProjection, rayCameraWorld: this.raysMaterial.uniforms.cameraWorld, rayCenter: this.raysMaterial.uniforms.curveCenter, rayHorizon: { value: 0 } });
    this.quad.frustumCulled = false; this.scene.add(this.quad);
  }
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    visual: Readonly<VisualSettings>, focus: number, close: number, overview: boolean, displayScale: number,
    light?: { direction: THREE.Vector3; color: THREE.Color; power: number }, shadowLight?: THREE.DirectionalLight,
    curve?: { center: THREE.Vector3; strength: number; range: number }) {
    const dof = camera instanceof THREE.PerspectiveCamera && !overview ? visual.depthOfField * (.8 + .2 * close) : 0;
    this.composite.uniforms.lensDistortion.value = overview ? 0 : visual.lensDistortion;
    this.stats.passes = 0;
    this.stats.rayPasses = 0;
    let rayPower = light && fogShaftsEnabled(visual, overview, !!shadowLight?.castShadow && renderer.shadowMap.enabled) ? visual.lightRays * light.power * .18 : 0;
    if (overview || (visual.bloom === 0 && visual.chromaticAberration === 0 && visual.lensDistortion === 0 && dof === 0 && visual.colorBalance === 0 && rayPower < .0001)) { renderer.render(scene, camera); return; }
    renderer.getDrawingBufferSize(this.size);
    this.composite.uniforms.lensAspect.value = this.size.x / this.size.y;
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) {
      this.target.setSize(this.size.x, this.size.y);
      this.glowA.setSize(Math.max(1, Math.ceil(this.size.x / 2)), Math.max(1, Math.ceil(this.size.y / 2)));
      this.glowB.setSize(this.glowA.width, this.glowA.height);
      this.raysTarget.setSize(Math.max(1, Math.ceil(this.size.x / 4)), Math.max(1, Math.ceil(this.size.y / 4)));
    }
    this.stats.width = this.target.width; this.stats.height = this.target.height;
    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(this.target); renderer.render(scene, camera);
      const shadow = shadowLight?.shadow;
      if (!shadow?.map?.depthTexture?.compareFunction) rayPower = 0; // PCF depth-comparison path only.
      if (rayPower >= .0001) {
        const r = this.raysMaterial.uniforms;
        r.depth.value = this.target.depthTexture; r.lightDepth.value = shadow!.map!.depthTexture;
        r.inverseProjection.value.copy(camera.projectionMatrixInverse); r.cameraWorld.value.copy(camera.matrixWorld); r.lightMatrix.value.copy(shadow!.matrix);
        r.shadowBias.value = shadow!.bias; r.cameraFar.value = camera.far;
        r.curvature.value = camera instanceof THREE.PerspectiveCamera ? curve?.strength ?? 0 : 0;
        r.curveCenter.value.set(curve?.center.x ?? 0, curve?.center.z ?? 0); r.viewRange.value = curve?.range ?? 80;
        this.quad.material = this.raysMaterial; renderer.setRenderTarget(this.raysTarget); renderer.render(this.scene, this.camera);
        this.stats.passes++; this.stats.rayPasses = 1;
      }
      if (visual.bloom > 0) {
        this.quad.material = this.blur;
        this.blur.uniforms.source.value = this.target.texture; this.blur.uniforms.extract.value = 1;
        this.blur.uniforms.stepSize.value.set(1 / this.glowA.width, 0);
        renderer.setRenderTarget(this.glowA); renderer.render(this.scene, this.camera);
        this.blur.uniforms.source.value = this.glowA.texture; this.blur.uniforms.extract.value = 0;
        this.blur.uniforms.stepSize.value.set(0, 1 / this.glowA.height);
        renderer.setRenderTarget(this.glowB); renderer.render(this.scene, this.camera); this.stats.passes += 2;
      }
      const u = this.composite.uniforms;
      u.source.value = this.target.texture; u.depth.value = this.target.depthTexture; u.bloom.value = this.glowB.texture;
      u.pixelSize.value.set(displayScale / this.size.x, displayScale / this.size.y);
      u.aaPixelSize.value.set(1 / this.size.x, 1 / this.size.y); u.clearBackground.value = visual.skyEnabled || visual.fogEnabled ? 0 : 1;
      u.bloomStrength.value = visual.bloom; u.aberration.value = visual.chromaticAberration; u.dof.value = dof;
      u.colorBalance.value = visual.colorBalance;
      u.rayPower.value = rayPower; if (light) u.rayColor.value.copy(light.color);
      u.rayTexel.value.set(1 / this.raysTarget.width, 1 / this.raysTarget.height); u.rayOrthographic.value = camera instanceof THREE.OrthographicCamera ? 1 : 0;
      u.rayHorizon.value = curve && visual.fogEnabled ? curve.range : 0;
      u.focusDistance.value = focus; u.cameraNear.value = camera.near; u.cameraFar.value = camera.far;
      this.quad.material = this.composite;
      renderer.setRenderTarget(previous); renderer.render(this.scene, this.camera); this.stats.passes++;
    } finally { renderer.setRenderTarget(previous); }
  }
  dispose() {
    this.target.dispose(); this.glowA.dispose(); this.glowB.dispose(); this.raysTarget.dispose(); this.raysMaterial.dispose();
    this.quad.geometry.dispose(); this.blur.dispose(); this.composite.dispose(); this.scene.clear();
  }
}
