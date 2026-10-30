import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, type Plugin } from "esbuild";
import { createRpg } from "../src/rpg/engine";
import { tile } from "../src/rpg/world";

const output = "docs/art-audit/foliage-v1";
const nativeVoxelPlugin: Plugin = { name: "native-voxel-inline", setup(builder) {
  builder.onResolve({ filter: /\.vox\?url&inline$/ }, args => ({ path: resolve(args.resolveDir, args.path.split("?")[0]), namespace: "native-vox" }));
  builder.onLoad({ filter: /.*/, namespace: "native-vox" }, async args => ({ contents: `export default ${JSON.stringify("data:application/octet-stream;base64," + (await readFile(args.path)).toString("base64"))};`, loader: "js" }));
} };
async function frames(page: Page, count = 45) {
  await page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(resolve => requestAnimationFrame(resolve)); }, count);
}
async function measure(page: Page) {
  return page.evaluate(async () => {
    let last = await new Promise<number>(resolve => requestAnimationFrame(resolve)); const start = last, intervals: number[] = [];
    while (last - start < 2500) { const now = await new Promise<number>(resolve => requestAnimationFrame(resolve)); intervals.push(now - last); last = now; }
    intervals.sort((a, b) => a - b);
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="three-canvas"]')!.getContext("webgl2")!, extension = gl.getExtension("WEBGL_debug_renderer_info");
    return { fps: intervals.length * 1000 / (last - start), p95Ms: intervals[Math.floor(intervals.length * .95)],
      browser: navigator.userAgent, viewport: [innerWidth, innerHeight], devicePixelRatio,
      gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : "unavailable", buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      counters: { ...document.querySelector<HTMLElement>('[data-renderer="3d"]')!.dataset } };
  });
}
test("tile foliage animates, controls persist, and the game keeps working offline in both orientations", async ({ page, context }) => {
  await mkdir(output, { recursive: true }); const errors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => { const url = new URL(request.url()); if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1") external.push(url.href); });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto("./?renderer=3d");
  const world = page.getByTestId("rpg-world"), panel = page.getByRole("dialog", { name: "Visual settings" });
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  const fixture = createRpg(Date.now(), 8128);
  Object.assign(fixture.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 });
  fixture.player.position = tile(60, 106); fixture.player.previousPosition = { ...fixture.player.position }; fixture.player.path = []; fixture.player.action = null; fixture.player.movement = null;
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "foliage-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
  await expect.poll(async () => Number(await world.getAttribute("data-foliage-visible"))).toBeGreaterThan(100);
  await frames(page, 100);
  const trials = [];
  for (const enabled of [false, true, false]) {
    await page.getByRole("button", { name: "Visual settings", exact: true }).click();
    await panel.getByRole("checkbox", { name: "Enable ground foliage", exact: true }).setChecked(enabled);
    await panel.getByRole("button", { name: "Done", exact: true }).click(); await frames(page);
    trials.push({ enabled, ...await measure(page) });
    await page.screenshot({ path: `${output}/world-${enabled ? "on" : trials.length === 1 ? "before" : "off"}.png` });
  }
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  await panel.getByRole("checkbox", { name: "Enable ground foliage", exact: true }).check();
  await panel.getByRole("slider", { name: "Wind strength", exact: true }).press("Home");
  await expect.poll(async () => JSON.parse((await world.getAttribute("data-visual-settings"))!).windStrength).toBe(0);
  await frames(page); const stopped = await world.getAttribute("data-wind-time"); await frames(page); expect(await world.getAttribute("data-wind-time")).toBe(stopped);
  await panel.getByRole("slider", { name: "Wind strength", exact: true }).press("End");
  await expect.poll(async () => Number(await world.getAttribute("data-wind-time"))).toBeGreaterThan(Number(stopped));
  await panel.getByRole("slider", { name: "Foliage density", exact: true }).press("Home");
  await expect(world).toHaveAttribute("data-foliage-visible", "0");
  await panel.getByRole("button", { name: "Reset visual settings", exact: true }).click();
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Day lighting", exact: true }).click(); await frames(page); await page.screenshot({ path: `${output}/world-day.png` });
  await page.getByRole("button", { name: "Orthographic camera", exact: true }).click(); await frames(page); await page.screenshot({ path: `${output}/world-orthographic.png` });
  await page.setViewportSize({ width: 390, height: 844 }); await frames(page); await page.screenshot({ path: `${output}/phone-portrait.png` });
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  await panel.getByRole("slider", { name: "Foliage density", exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/phone-controls.png` });
  await panel.getByRole("slider", { name: "Foliage density", exact: true }).press("End"); await panel.getByRole("button", { name: "Done", exact: true }).click();
  await page.setViewportSize({ width: 844, height: 390 }); await frames(page); await page.screenshot({ path: `${output}/phone-landscape.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.getByRole("button", { name: "Open game menu" }).click(); await page.getByRole("button", { name: "Save on device" }).click(); await expect(page.getByRole("status")).toContainText("Chronicle saved");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true); await page.reload(); await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  await expect.poll(async () => Number(await world.getAttribute("data-foliage-visible"))).toBeGreaterThan(0);
  await expect.poll(async () => JSON.parse((await world.getAttribute("data-visual-settings"))!).foliageDensity).toBe(1);
  await context.setOffline(false); await page.setViewportSize({ width: 1280, height: 800 });
  fixture.player.position = tile(112, 24); fixture.player.previousPosition = { ...fixture.player.position };
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "foliage-shore-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click(); await frames(page);
  await page.screenshot({ path: `${output}/ground-contact-world.png` });
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(`${output}/game-review.json`, JSON.stringify({ trials, errors, external, note: "Off/on/off host RAF observations with full scene and reflected foliage. Not isolated GPU cost or a physical-phone benchmark." }, null, 2) + "\n");
});

test("GPU clump pixels move with wind and remain still with zero wind or reduced motion", async ({ page }) => {
  await mkdir(output, { recursive: true }); const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const bundled = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "foliage-lab.ts", contents: `
    import * as THREE from 'three';
    import { FoliageSystem } from './src/render/three/foliage';
    import { DEFAULT_VISUAL_SETTINGS } from './src/render/three/visual-settings';
    const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true});renderer.setSize(640,480);
    renderer.outputColorSpace=THREE.SRGBColorSpace; const scene=new THREE.Scene();scene.background=new THREE.Color(0xc9cbb2);scene.add(new THREE.HemisphereLight(0xffffff,0x667744,2));
    const system=new FoliageSystem(scene),target=new THREE.Vector3(),visual={...DEFAULT_VISUAL_SETTINGS,windStrength:2,foliageDensity:1};
    const mesh=system.meshes[0];mesh.count=1;mesh.setMatrixAt(0,new THREE.Matrix4());mesh.setColorAt(0,new THREE.Color(0xffffff));mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.frustumCulled=false;
    const camera=new THREE.OrthographicCamera(-.45,.45,.55,-.125,.1,20);camera.position.set(0,0,4);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    function draw(time,reduced=false){system.update(time,target,visual,false,reduced);renderer.render(scene,camera);}
    function read(){const gl=renderer.getContext(),p=new Uint8Array(640*480*4);gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
    function difference(a,b){let sum=0;for(let i=0;i<a.length;i++)if(i%4!==3)sum+=Math.abs(a[i]-b[i]);return sum/(a.length*.75);}
    draw(0);const first=read();for(let i=1;i<=80;i++)draw(i*100);const moved=read();
    visual.windStrength=0;draw(8100);const still=read();draw(8200);const still2=read();
    visual.windStrength=2;draw(8300,true);const reduced=read();draw(8400,true);const reduced2=read();
    window.foliageLab={windDelta:difference(first,moved),stillDelta:difference(still,still2),reducedDelta:difference(reduced,reduced2),straightDelta:difference(still,reduced),glError:renderer.getContext().getError()};
    window.showClumps=(angle=0)=>{renderer.setSize(960,420);for(let i=0;i<4;i++){const m=system.meshes[i],d=(i-1.5)*.9;m.count=1;m.setMatrixAt(0,new THREE.Matrix4().makeTranslation(d*Math.cos(angle),0,-d*Math.sin(angle)));m.setColorAt(0,new THREE.Color(0xffffff));m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;m.frustumCulled=false;}camera.left=-2;camera.right=2;camera.top=.875;camera.bottom=-.875;camera.updateProjectionMatrix();camera.position.set(Math.sin(angle)*4,1.8,Math.cos(angle)*4);camera.lookAt(0,.35,0);camera.updateMatrixWorld();draw(8500);};
  ` }, bundle: true, format: "iife", write: false, logLevel: "error", plugins: [nativeVoxelPlugin] });
  await page.setContent('<!doctype html><style>body{margin:0;background:#c9cbb2}canvas{display:block}</style><canvas></canvas>');
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const result = await page.evaluate(() => (window as unknown as { foliageLab: { windDelta: number; stillDelta: number; reducedDelta: number; straightDelta: number; glError: number } }).foliageLab);
  expect(result.glError).toBe(0); expect(result.windDelta).toBeGreaterThan(.05); expect(result.stillDelta).toBe(0); expect(result.reducedDelta).toBe(0); expect(result.straightDelta).toBe(0);
  for (const [name, angle] of [["front", 0], ["side", Math.PI / 2], ["back", Math.PI], ["quarter", Math.PI / 4]] as const) {
    await page.evaluate(a => (window as unknown as { showClumps: (angle: number) => void }).showClumps(a), angle);
    await page.locator("canvas").screenshot({ path: `${output}/clump-${name}.png` });
  }
  await writeFile(`${output}/gpu-review.json`, JSON.stringify({ ...result, errors }, null, 2) + "\n"); expect(errors).toEqual([]);
});

test("foliage behind a character pivot cannot cut its body or held item in either camera", async ({ page }) => {
  await mkdir(output, { recursive: true }); const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const bundled = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "foliage-depth-lab.ts", contents: `
    import * as THREE from 'three';
    import { FoliageSystem } from './src/render/three/foliage';
    import { PixelBillboards } from './src/render/three/pixel-billboards';
    import { DEFAULT_VISUAL_SETTINGS } from './src/render/three/visual-settings';
    const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true,antialias:false});renderer.setSize(480,480);
    renderer.outputColorSpace=THREE.SRGBColorSpace;const scene=new THREE.Scene();scene.background=new THREE.Color(0xc9cbb2);scene.add(new THREE.HemisphereLight(0xffffff,0x667744,2));
    const units=new PixelBillboards({terrain:{},createActor(){throw Error('legacy')},createEnemy(){throw Error('legacy')},createObject(){throw Error('legacy')},dispose(){}}),actor=units.library.createActor({id:0,name:'Alden',role:'prince'});
    scene.add(actor.group);actor.group.children[1].visible=false;units.frame(actor.group,6,0,undefined,'pickaxe',true);
    const foliage=new FoliageSystem(scene);foliage.update(0,new THREE.Vector3(),{...DEFAULT_VISUAL_SETTINGS,windStrength:0,foliageDensity:1},false);
    const reed=foliage.meshes[3];reed.count=1;reed.setColorAt(0,new THREE.Color(0xffffff));reed.instanceColor.needsUpdate=true;reed.frustumCulled=false;
    function read(){const gl=renderer.getContext(),p=new Uint8Array(480*480*4);gl.readPixels(0,0,480,480,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
    function draw(camera,person,plant,z){actor.group.visible=person;reed.visible=plant;reed.setMatrixAt(0,new THREE.Matrix4().makeTranslation(.03,0,z));reed.instanceMatrix.needsUpdate=true;renderer.render(scene,camera);return read();}
    const cameras=[new THREE.PerspectiveCamera(35,1,.1,50),new THREE.OrthographicCamera(-.9,.9,.9,-.9,.1,50)],results=[];
    for(const camera of cameras){camera.position.set(0,3,5);camera.lookAt(0,.5,0);if(camera.isPerspectiveCamera)camera.zoom=2.2;camera.updateProjectionMatrix();camera.updateMatrixWorld();units.faceCamera(camera,0);actor.group.updateMatrixWorld(true);
      const empty=draw(camera,false,false,0),body=draw(camera,true,false,0),behind=draw(camera,true,true,-.16),plant=draw(camera,false,true,-.16),front=draw(camera,true,true,.16);
      let overlap=0,behindChanged=0,frontChanged=0,bodyPixels=0;
      for(let i=0;i<body.length;i+=4){const differs=(a,b)=>Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>3;
        if(!differs(body,empty))continue;bodyPixels++;if(differs(plant,empty))overlap++;if(differs(behind,body))behindChanged++;if(differs(front,body))frontChanged++;
      }
      results.push({camera:camera.type,bodyPixels,overlap,behindChanged,frontChanged});
    }
    window.pivotLab={results,glError:renderer.getContext().getError()};
  ` }, bundle: true, format: "iife", write: false, logLevel: "error", plugins: [nativeVoxelPlugin] });
  await page.setContent('<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'); await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const result = await page.evaluate(() => (window as unknown as { pivotLab: { results: { camera: string; bodyPixels: number; overlap: number; behindChanged: number; frontChanged: number }[]; glError: number } }).pivotLab);
  for (const view of result.results) { expect(view.bodyPixels).toBeGreaterThan(100); expect(view.overlap).toBeGreaterThan(10); expect(view.behindChanged).toBe(0); expect(view.frontChanged).toBeGreaterThan(10); }
  expect(result.glError).toBe(0); expect(errors).toEqual([]); await page.locator("canvas").screenshot({ path: `${output}/pivot-depth.png` });
  await writeFile(`${output}/pivot-depth.json`, JSON.stringify({ ...result, errors }, null, 2) + "\n");
});

test("opaque ground does not cut the bases of native foliage across camera angles and quarter turns", async ({ page }) => {
  await mkdir(output, { recursive: true }); const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const bundled = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "foliage-ground-lab.ts", contents: `
    import * as THREE from 'three';
    import { FoliageSystem, FOLIAGE_KINDS } from './src/render/three/foliage';
    import { DEFAULT_VISUAL_SETTINGS } from './src/render/three/visual-settings';
    const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true,antialias:false});renderer.setSize(320,320);
    renderer.outputColorSpace=THREE.SRGBColorSpace;const scene=new THREE.Scene();scene.background=new THREE.Color(0xc9cbb2);scene.add(new THREE.HemisphereLight(0xffffff,0x667744,2));
    const foliage=new FoliageSystem(scene);foliage.update(0,new THREE.Vector3(),{...DEFAULT_VISUAL_SETTINGS,windStrength:0,foliageDensity:1},false);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshBasicMaterial({color:0xb68e50}));ground.rotation.x=-Math.PI/2;scene.add(ground);
    const cameras=[new THREE.PerspectiveCamera(35,1,.1,650),new THREE.OrthographicCamera(-.65,.65,.65,-.65,.1,650)],results=[];
    function read(){const gl=renderer.getContext(),p=new Uint8Array(320*320*4);gl.readPixels(0,0,320,320,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
    function draw(camera,mesh,floor){for(const m of foliage.meshes)m.visible=m===mesh;ground.visible=floor;renderer.render(scene,camera);return read();}
    for(const camera of cameras)for(const distance of [1,16])for(const wind of [0,2])for(const yaw of [0,Math.PI/4])for(let k=0;k<4;k++)for(let turn=0;turn<4;turn++){
      camera.position.set(Math.sin(yaw)*3*distance,2.55*distance+.25,Math.cos(yaw)*3*distance);camera.lookAt(0,.25,0);if(camera.isPerspectiveCamera)camera.zoom=2.1*distance;camera.updateProjectionMatrix();camera.updateMatrixWorld();
      foliage.update(5000,new THREE.Vector3(),{...DEFAULT_VISUAL_SETTINGS,windStrength:wind,foliageDensity:1},false);
      const mesh=foliage.meshes[k];mesh.count=1;mesh.setColorAt(0,new THREE.Color(0xffffff));mesh.instanceColor.needsUpdate=true;
      mesh.setMatrixAt(0,new THREE.Matrix4().makeRotationY(turn*Math.PI/2));mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;
      const empty=draw(camera,null,false),plant=draw(camera,mesh,false),onGround=draw(camera,mesh,true);let plantPixels=0,clippedPixels=0;
      for(let i=0;i<plant.length;i+=4){const delta=(a,b)=>Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(delta(plant,empty)<=3)continue;plantPixels++;if(delta(plant,onGround)>3)clippedPixels++;}
      results.push({camera:camera.type,distance,wind,yaw,kind:FOLIAGE_KINDS[k],turn,plantPixels,clippedPixels});
    }
    window.groundLab={results,glError:renderer.getContext().getError()};
  ` }, bundle: true, format: "iife", write: false, logLevel: "error", plugins: [nativeVoxelPlugin] });
  await page.setContent('<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>'); await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const result = await page.evaluate(() => (window as unknown as { groundLab: { results: { camera: string; kind: string; turn: number; plantPixels: number; clippedPixels: number }[]; glError: number } }).groundLab);
  await writeFile(`${output}/ground-contact.json`, JSON.stringify({ ...result, errors }, null, 2) + "\n");
  for (const view of result.results) { expect(view.plantPixels).toBeGreaterThan(20); expect(view.clippedPixels, JSON.stringify(view)).toBeLessThanOrEqual(2); }
  expect(result.glError).toBe(0); expect(errors).toEqual([]); await page.locator("canvas").screenshot({ path: `${output}/ground-contact.png` });
});
