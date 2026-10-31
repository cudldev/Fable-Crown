import { renderFrameCount } from "./render-profile";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { tile, WORLD } from "../src/rpg/world";

test.use({ actionTimeout: 20000 });

test("clear shoreline remains drawable in game, camera modes, phone views and offline", async ({ page, context }) => {
  const output = "docs/art-audit/water-depth-v4"; await mkdir(output, { recursive: true });
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  page.on("request", request => { const url = new URL(request.url()); if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1") external.push(url.href); });
  await page.emulateMedia({ reducedMotion: "no-preference" }); await page.setViewportSize({ width: 1280, height: 800 }); await page.goto("./");
  const world = page.getByTestId("rpg-world"); await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  const state = createRpg(Date.now(), 8128), y = 62, bank = WORLD.terrain.slice(y * WORLD.width, (y + 1) * WORLD.width).indexOf("water") - 1;
  Object.assign(state.control, { autoplay: false, waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1e9 });
  state.player.position = tile(bank, y); state.player.previousPosition = { ...state.player.position }; state.player.path = []; state.player.action = null; state.player.movement = null;
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "clear-water.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
  const captures = [];
  for (const [name, width, height, mode, lighting] of [
    ["day", 1280, 800, "Perspective camera", "Day lighting"], ["dusk", 1280, 800, "Perspective camera", "Dusk lighting"],
    ["orthographic", 1280, 800, "Orthographic camera", "Day lighting"],
    ["portrait", 390, 844, "Perspective camera", "Day lighting"], ["landscape", 844, 390, "Perspective camera", "Day lighting"],
  ] as const) {
    // Set review controls before the phone viewport, where the minimap can cover them.
    await page.setViewportSize({ width: 1280, height: 800 }); await page.getByRole("button", { name: mode, exact: true }).click();
    await page.getByRole("button", { name: lighting, exact: true }).click();
    await page.setViewportSize({ width, height });
    await expect(world).toHaveAttribute("data-water-reflection-state", "ready");
    await page.evaluate(async count => { for (let i = 0; i < count; i++) await new Promise(resolve => requestAnimationFrame(resolve)); }, renderFrameCount(45));
    await page.screenshot({ path: `${output}/${name}.png` });
    if (name === "day") {
      await mkdir(`${output}/game-motion`, { recursive: true });
      for (let frame = 0; frame < renderFrameCount(20); frame++) {
        await page.screenshot({ path: `${output}/game-motion/${String(frame).padStart(3, "0")}.png`, clip: { x: 560, y: 170, width: 420, height: 430 } });
        await page.waitForTimeout(400);
      }
    }
    const glError = await page.getByTestId("three-canvas").evaluate(canvas => (canvas as HTMLCanvasElement).getContext("webgl2")!.getError());
    expect(glError).toBe(0); captures.push({ name, glError });
  }
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), { timeout: 30000 }).toBe(true);
  await page.getByRole("button", { name: "Open game menu" }).click(); await page.getByRole("button", { name: /Save world offline/ }).click();
  await expect(page.getByRole("button", { name: "World saved offline" })).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Close panel" }).click();
  await context.setOffline(true);
  try { await page.reload(); await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 }); await expect(world).toHaveAttribute("data-water-reflection-state", "ready"); }
  finally { await context.setOffline(false); }
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(`${output}/game-review.json`, JSON.stringify({ captures, errors, external, offline: true }, null, 2));
});

test("shallow bed transmits, deep water absorbs, and shoreline hugs only dry edges", async ({ page }) => {
  const output = "docs/art-audit/water-depth-v4"; await mkdir(output, { recursive: true });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  const compiled = await build({ stdin: { resolveDir: process.cwd(), contents: `
    import * as T from 'three';
    import { WaterSystem, WATER_HEIGHT } from './src/render/three/water';
    import { DEFAULT_VISUAL_SETTINGS } from './src/render/three/visual-settings';
    const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true});renderer.setSize(900,500);
    renderer.outputColorSpace=T.SRGBColorSpace;
    const scene=new T.Scene();scene.background=new T.Color(0x9caeb9);scene.add(new T.AmbientLight(0xffffff,1));
    const system=new WaterSystem();system.setWorld({width:9,height:5,terrain:Array.from({length:45},(_,i)=>i%9===0?'sand':'water')});
    const positions=[];for(let z=0;z<5;z++)for(let x=1;x<9;x++)positions.push(x-.5,WATER_HEIGHT,z-.5,x-.5,WATER_HEIGHT,z+.5,x+.5,WATER_HEIGHT,z+.5,x-.5,WATER_HEIGHT,z-.5,x+.5,WATER_HEIGHT,z+.5,x+.5,WATER_HEIGHT,z-.5);
    const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
    const water=new T.Mesh(geometry,system.material);water.renderOrder=-1;scene.add(water);
    const bed=new T.Mesh(system.createBed(geometry),system.bedMaterial);scene.add(bed);
    const land=new T.Mesh(new T.BoxGeometry(1,.3,5),new T.MeshLambertMaterial({color:0x949176}));land.position.set(0,-.15,2);scene.add(land);
    const camera=new T.OrthographicCamera(-4.5,4.5,2.5,-2.5,.1,30);camera.position.set(4,12,2);camera.up.set(0,0,-1);camera.lookAt(4,0,2);camera.updateMatrixWorld();
    system.update(renderer,scene,camera,[water],[],0,'day',{...DEFAULT_VISUAL_SETTINGS,waterReflections:false,waterRippleStrength:0},false);
    function sample(x,z){const p=new T.Vector3(x,WATER_HEIGHT,z).project(camera),gl=renderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(Math.round((p.x*.5+.5)*900),Math.round((p.y*.5+.5)*500),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];}
    function draw(){renderer.render(scene,camera);return {shallow:sample(.7,2),deep:sample(3,2),edge:sample(.55,2),outer:sample(.76,2),join:sample(1.5,2),
      profile:Array.from({length:40},(_,i)=>[sample(.55,i*.1),sample(.7,i*.1),sample(.8,i*.1)])};}
    system.bedMaterial.color.setHex(0xff0000);const red=draw();system.bedMaterial.color.setHex(0x0000ff);const blue=draw();
    system.bedMaterial.color.setHex(0x8d947d);const foam=draw();
    const compile=system.material.onBeforeCompile;system.material.onBeforeCompile=(shader,r)=>{compile(shader,r);shader.fragmentShader=shader.fragmentShader.replace('waterFoam*.68','0.0');};
    system.material.customProgramCacheKey=()=> 'water-no-foam-lab';system.material.needsUpdate=true;const plain=draw();
    system.material.onBeforeCompile=compile;system.material.customProgramCacheKey=()=> 'water-with-foam-lab';system.material.needsUpdate=true;
    system.update(renderer,scene,camera,[water],[],4000,'day',{...DEFAULT_VISUAL_SETTINGS,waterReflections:false,waterRippleStrength:0},false);
    const moved=draw();
    // Isolate the real foam shader for feature tracking, without albedo/depth changes.
    system.material.onBeforeCompile=(shader,r)=>{compile(shader,r);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight=vec3(waterFoam);diffuseColor.a=1.0;\\n#include <opaque_fragment>');};
    system.material.customProgramCacheKey=()=> 'water-foam-tracking';system.material.needsUpdate=true;
    function field(time){system.update(renderer,scene,camera,[water],[],time,'day',{...DEFAULT_VISUAL_SETTINGS,waterReflections:false,waterRippleStrength:0},false);renderer.render(scene,camera);
      const gl=renderer.getContext(),pixels=new Uint8Array(900*500*4);gl.readPixels(0,0,900,500,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
    const first=field(4000),later=field(4500);
    function bilinear(p,x,y){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
      return (p[(iy*900+ix)*4]*(1-fx)+p[(iy*900+ix+1)*4]*fx)*(1-fy)+(p[((iy+1)*900+ix)*4]*(1-fx)+p[((iy+1)*900+ix+1)*4]*fx)*fy;}
    let stillError=0,flowError=0,count=0;
    for(let y=60;y<440;y++)for(let x=103;x<140;x++){
      const a=first[(y*900+x)*4];stillError+=Math.abs(a-later[(y*900+x)*4]);
      flowError+=Math.abs(a-bilinear(later,x+.6,y-3.25));count++;
    }
    const tracking={stillError:stillError/count,flowError:flowError/count,ratio:flowError/stillError};
    system.material.onBeforeCompile=compile;system.material.customProgramCacheKey=()=> 'water-motion-review';system.material.needsUpdate=true;
    window.drawWaterTime=(time)=>{system.update(renderer,scene,camera,[water],[],time,'day',{...DEFAULT_VISUAL_SETTINGS,waterReflections:false,waterRippleStrength:0},false);renderer.render(scene,camera);};
    window.drawWaterTime(4000);
    window.waterDepthLab={red,blue,foam,plain,moved,tracking,glError:renderer.getContext().getError()};
  ` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  await page.setViewportSize({ width: 900, height: 500 });
  await page.setContent('<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>');
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  type Samples = Record<"shallow" | "deep" | "edge" | "outer" | "join", number[]> & { profile: number[][][] };
  const result = await page.evaluate(() => (window as unknown as { waterDepthLab: { red: Samples; blue: Samples; foam: Samples; plain: Samples; moved: Samples; tracking: { stillError: number; flowError: number; ratio: number }; glError: number } }).waterDepthLab);
  const difference = (a: number[], b: number[]) => Math.max(...a.slice(0, 3).map((value, i) => Math.abs(value - b[i])));
  expect(difference(result.red.shallow, result.blue.shallow)).toBeGreaterThan(15);
  expect(difference(result.red.deep, result.blue.deep)).toBeLessThanOrEqual(2);
  const profile = result.foam.profile.map((row, z) => row.map((pixel, x) => difference(pixel, result.plain.profile[z][x])));
  const motion = result.foam.profile.flatMap((row, z) => row.map((pixel, x) => difference(pixel, result.moved.profile[z][x])));
  // Actual foam and substantial quiet gaps, including at the same distance from a straight bank.
  expect(profile.flat().filter(value => value > 8).length).toBeGreaterThan(8);
  expect(profile.filter(row => row[0] <= 2).length).toBeGreaterThan(6);
  expect(Math.max(...profile.map(row => row[2]))).toBeGreaterThan(8);
  expect(Math.max(...motion)).toBeGreaterThan(3);
  // Features actually travel downstream and retain their shape over adjacent times.
  expect(result.tracking.ratio).toBeLessThan(.7);
  expect(difference(result.foam.join, result.plain.join)).toBe(0);
  expect(result.glError).toBe(0); expect(errors).toEqual([]);
  await page.screenshot({ path: `${output}/depth-lab.png` });
  await writeFile(`${output}/depth-lab.json`, JSON.stringify({ ...result, errors, foamSummary: {
    visibleSamples: profile.flat().filter(value => value > 8).length,
    quietBankSamples: profile.filter(row => row[0] <= 2).length,
    outerPeak: Math.max(...profile.map(row => row[2])), motionPeak: Math.max(...motion),
  } }, null, 2));
  await mkdir(`${output}/motion`, { recursive: true });
  for (let frame = 0; frame < 32; frame++) {
    await page.evaluate(time => (window as unknown as { drawWaterTime: (time: number) => void }).drawWaterTime(time), 4000 + frame * 250);
    await page.screenshot({ path: `${output}/motion/${String(frame).padStart(3, "0")}.png`, clip: { x: 65, y: 0, width: 200, height: 500 } });
  }
});
