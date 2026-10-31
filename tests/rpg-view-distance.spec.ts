import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { tile, worldForState } from "../src/rpg/world";

const output = "docs/art-audit/curved-view-v1";
test.use({ actionTimeout: 15000 });

test("fogged targets cannot be clicked through the curved horizon and nearby actors remain selectable", async ({ page, context }) => {
  await mkdir(output, { recursive: true }); const errors: string[] = [], external: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  page.on("request", r => { const url = new URL(r.url()); if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1") external.push(url.href); });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto("./");
  const world = page.getByTestId("rpg-world"), panel = page.getByRole("dialog", { name: "Visual settings" });
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  const fixture = createRpg(Date.now(), 8128);
  Object.assign(fixture.control, { waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1_000_000_000 });
  fixture.player.position = tile(60, 106); fixture.player.previousPosition = { ...fixture.player.position }; fixture.player.path = []; fixture.player.action = null; fixture.player.movement = null;
  const far = worldForState(fixture).objects.filter(object => object.kind === "tree"
    && Math.hypot(object.position.x - 60, object.position.y - 106) > 28
    && (object.position.x - 60) * 32 + (object.position.y - 106) * 45 < -1100)
    .sort((a, b) => Math.hypot(a.position.x - 43, a.position.y - 82) - Math.hypot(b.position.x - 43, b.position.y - 82))[0];
  expect(far).toBeDefined();
  await page.getByRole("button", { name: "Open game menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "curved-view.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel" }).click();
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Visual settings", exact: true }).click();
  await panel.getByRole("slider", { name: "World curvature", exact: true }).press("End");
  await panel.getByRole("slider", { name: "Fog reach", exact: true }).press("End");
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await expect(world).toHaveAttribute("data-visibility-far", "24.00");
  const farButton = world.locator(`[data-three-selection='${JSON.stringify({ kind: "object", id: far.id })}']`);
  await expect(farButton).toHaveAttribute("hidden", "");
  await world.getByRole("button", { name: "Inspect Alden", exact: true }).click();
  await expect(page.getByRole("region", { name: "Character details" })).toContainText("Alden");
  await page.getByRole("button", { name: "Close actions" }).click();
  await page.screenshot({ path: `${output}/close-horizon.png` });
  await page.getByRole("button", { name: "Orthographic camera", exact: true }).click();
  await expect(farButton).toHaveAttribute("hidden", "");
  await page.getByRole("button", { name: "Perspective camera", exact: true }).click();
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await expect(farButton).toHaveAttribute("hidden", "");
    await page.screenshot({ path: `${output}/${viewport.width < 500 ? "portrait" : "landscape"}.png` });
  }
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await context.setOffline(true); await page.reload();
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 60000 });
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile(`${output}/game-review.json`, JSON.stringify({ errors, external, counters: await world.evaluate(e => ({ ...(e as HTMLElement).dataset })) }, null, 2));
});

test("actual GPU fog blends into the sky before clipping distant ordinary and instanced geometry", async ({ page }) => {
  await mkdir(output, { recursive: true }); const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  const bundled = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "view-distance-lab.ts", contents: `
import * as THREE from 'three';
import { WorldCurve } from './src/render/three/world-curve';
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true,antialias:true});renderer.setSize(640,480);renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x34505f);scene.fog=new THREE.Fog(0x34505f,1,200);
const camera=new THREE.PerspectiveCamera(70,640/480,.1,650);camera.position.set(0,20,60);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const curve=new WorldCurve();curve.update(new THREE.Vector3(),2,1,true);curve.view.update(camera,new THREE.Vector3(),12,60,false);
const geometry=new THREE.PlaneGeometry(3,3),material=new THREE.MeshBasicMaterial({color:0xff0000});
const positions=[new THREE.Vector3(0,0,0),new THREE.Vector3(22,0,0),new THREE.Vector3(26,0,0),new THREE.Vector3(-26,0,0)];
for(const position of positions.slice(0,3)){const mesh=new THREE.Mesh(geometry,material);mesh.position.copy(position);mesh.quaternion.copy(camera.quaternion);scene.add(mesh);}
const instanced=new THREE.InstancedMesh(geometry,material,1);instanced.setMatrixAt(0,new THREE.Matrix4().compose(positions[3],camera.quaternion,new THREE.Vector3(1,1,1)));scene.add(instanced);
curve.decorate(scene);curve.prepareCulling(scene);renderer.render(scene,camera);
const gl=renderer.getContext();function sample(point){const p=curve.bend(point.clone()).project(camera),out=new Uint8Array(4);gl.readPixels(Math.round((p.x+1)*320),Math.round((p.y+1)*240),1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);return [...out];}
window.viewLab={near:sample(positions[0]),fogged:sample(positions[1]),clipped:sample(positions[2]),instanced:sample(positions[3]),glError:gl.getError()};
window.viewDispose=()=>{curve.dispose();geometry.dispose();material.dispose();instanced.dispose();renderer.dispose();};
` }, bundle: true, format: "iife", write: false, logLevel: "error" });
  await page.setContent('<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>');
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const result = await page.evaluate(() => (window as unknown as { viewLab: { near: number[]; fogged: number[]; clipped: number[]; instanced: number[]; glError: number } }).viewLab);
  const sky = [52, 80, 95], difference = (color: number[]) => sky.reduce((sum, value, i) => sum + Math.abs(value - color[i]), 0);
  expect(result.glError).toBe(0); expect(difference(result.fogged)).toBeLessThan(difference(result.near) * .3);
  expect(difference(result.clipped)).toBeLessThanOrEqual(3); expect(difference(result.instanced)).toBeLessThanOrEqual(3);
  await page.screenshot({ path: `${output}/fog-lab.png` }); await writeFile(`${output}/gpu-review.json`, JSON.stringify({ ...result, errors }, null, 2));
  await page.evaluate(() => (window as unknown as { viewDispose: () => void }).viewDispose()); expect(errors).toEqual([]);
});
