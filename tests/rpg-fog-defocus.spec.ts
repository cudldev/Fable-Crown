import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

type DefocusReview = { sharpEdge: number; blurredEdge: number; sharpEnergy: number; blurredEnergy: number; glError: number };
type DefocusWindow = Window & { defocusReview: DefocusReview; defocusDispose: () => void };
test("depth of field softens fog silhouettes instead of restoring a sharp overlay", async ({ page }) => {
  const output = "docs/art-audit/shore-outline-v1"; await mkdir(output, { recursive: true }); const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
import * as T from 'three';import {PostProcessing} from './src/render/three/post-processing';import {DEFAULT_VISUAL_SETTINGS as D} from './src/render/three/visual-settings';
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true});renderer.setSize(640,480);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
const scene=new T.Scene();scene.background=new T.Color(0x334455);
const sun=new T.DirectionalLight(0xffffff,4);sun.position.set(12,16,22);sun.castShadow=true;sun.shadow.mapSize.set(512,512);Object.assign(sun.shadow.camera,{left:-20,right:20,top:20,bottom:-20,near:1,far:80});scene.add(sun,sun.target);
const mesh=new T.Mesh(new T.PlaneGeometry(2,12),new T.MeshBasicMaterial({color:0x334455}));mesh.position.set(0,1,0);scene.add(mesh);
const camera=new T.PerspectiveCamera(35,640/480,.1,100);camera.position.set(14,18,24);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const post=new PostProcessing(renderer),light={direction:sun.position.clone().normalize(),color:new T.Color(0xffffff),power:4};
function draw(dof,rays){post.render(renderer,scene,camera,{...D,skyEnabled:false,fogEnabled:true,bloom:0,chromaticAberration:0,lensDistortion:0,depthOfField:dof,colorBalance:.000001,lightRays:rays},10,1,false,1,light,sun);const gl=renderer.getContext(),pixels=new Uint8Array(640*480*4);gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
function contribution(dof){const off=draw(dof,0),on=draw(dof,1),diff=new Int16Array(on.length);for(let i=0;i<on.length;i++)diff[i]=on[i]-off[i];return diff;}
const sharp=contribution(0),blurred=contribution(1),center=new T.Vector3(0,1,0).project(camera),cx=Math.round((center.x+1)*320),cy=Math.round((center.y+1)*240);
function stats(diff){let edge=0,energy=0;for(let y=cy-50;y<cy+50;y++)for(let x=cx-70;x<cx+70;x++)for(let c=0;c<3;c++){const at=(y*640+x)*4+c;edge=Math.max(edge,Math.abs(diff[at]-diff[at+4]));energy+=Math.abs(diff[at]);}return {edge,energy};}
const a=stats(sharp),b=stats(blurred);draw(1,1);window.defocusReview={sharpEdge:a.edge,blurredEdge:b.edge,sharpEnergy:a.energy,blurredEnergy:b.energy,glError:renderer.getContext().getError()};
window.defocusDispose=()=>{post.dispose();mesh.geometry.dispose();mesh.material.dispose();sun.shadow.map?.dispose();sun.dispose();renderer.dispose();};
` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  await page.setContent('<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const review = await page.evaluate(() => (window as unknown as DefocusWindow).defocusReview);
  await writeFile(output + "/defocus-review.json", JSON.stringify({ review, errors }, null, 2)); await page.screenshot({ path: output + "/defocus-lab.png" });
  expect(review.sharpEnergy).toBeGreaterThan(0); expect(review.blurredEnergy).toBeGreaterThan(0); expect(review.blurredEdge).toBeLessThan(review.sharpEdge * .7); expect(review.glError).toBe(0);
  await page.evaluate(() => (window as unknown as DefocusWindow).defocusDispose()); expect(errors).toEqual([]);
});
