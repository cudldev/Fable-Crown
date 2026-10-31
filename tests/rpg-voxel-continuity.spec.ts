import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRpg } from "../src/rpg/engine";
import { WORLD, interactionTiles } from "../src/rpg/world";

test("forest detail progresses during continuous camera movement and settles without hiding trees", async ({ page, context }) => {
  test.setTimeout(180000);
  const output = "docs/performance/voxel-continuity"; await mkdir(output, { recursive: true });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const cdp = await context.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto("./?renderer=3d", { waitUntil: "domcontentloaded" });
  const world = page.getByTestId("rpg-world"), canvas = page.getByTestId("three-canvas");
  await expect(world).toHaveAttribute("data-status", "ready", { timeout: 120000 });
  const state = createRpg(Date.now(), 8128), tree = WORLD.objects.filter(o => o.kind === "tree").sort((a,b) => Math.hypot(a.position.x-45,a.position.y-87)-Math.hypot(b.position.x-45,b.position.y-87))[0];
  const position = interactionTiles(tree, WORLD)[0];
  Object.assign(state.control, { autoplay: false, waiting: true, goal: null, active: null, source: null, queue: [], thought: null, thinkingUntil: 1e9 });
  Object.assign(state.player, { position, previousPosition: { ...position }, path: [], movement: null, action: null });
  await page.getByRole("button", { name: "Open game menu", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "continuity.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole("status")).toContainText("Chronicle restored"); await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Day lighting", exact: true }).click();
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
  await expect(world).toHaveAttribute("data-voxel-queued", "0", { timeout: 60000 });
  await expect.poll(async () => Number(await world.getAttribute("data-voxel-native-trees")), { timeout: 60000 }).toBeGreaterThan(0);
  const start = await canvas.evaluate(element => {
    const b = element.getBoundingClientRect();
    for (const [x,y] of [[.5,.43],[.45,.35],[.6,.45],[.5,.6]]) {
      const p = { x:b.x+b.width*x,y:b.y+b.height*y,width:b.width,height:b.height },hit=document.elementFromPoint(p.x,p.y);
      if(hit===element||hit?.closest("[data-three-selection]"))return p;
    }
    throw Error("No exposed point for forest drag");
  });
  await page.mouse.move(start.x,start.y); await page.mouse.down();
  const observations = await page.evaluate(async start => {
    const root=document.querySelector<HTMLElement>('[data-testid="rpg-world"]')!,canvas=root.querySelector("canvas")!;
    const samples=[];let uiOpened=false,previous=0;
    for(let frame=0;frame<300;frame++) {
      const at=await new Promise<number>(requestAnimationFrame),d=root.dataset,phase=frame/299*Math.PI*2;
      samples.push({frame,at,intervalMs:previous?at-previous:0,x:Number(d.cameraX),z:Number(d.cameraY),instances:Number(d.voxelInstances),nativeTrees:Number(d.voxelNativeTrees),queued:Number(d.voxelQueued),
        cancelled:Number(d.voxelCancelled),pendingAgeMs:Number(d.voxelPendingAgeMs),transitions:Number(d.voxelTransitions),closestTreeId:d.voxelClosestTreeId,closestTreeLod:Number(d.voxelClosestTreeLod),closestTreeDesiredLod:Number(d.voxelClosestTreeDesiredLod)});previous=at;
      canvas.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,pointerId:1,pointerType:"mouse",buttons:1,clientX:start.x+Math.sin(phase)*start.width*.3,clientY:start.y+Math.sin(phase*.5)*start.height*.1}));
      if(frame===150||frame===210)canvas.dispatchEvent(new WheelEvent("wheel",{deltaY:frame===150?1400:-1400,bubbles:true,cancelable:true}));
      if(frame===75)document.querySelector<HTMLButtonElement>('button[aria-label="Open inventory"]')!.click();
      if(frame>75&&frame<105)uiOpened ||= !!document.querySelector(".inventory-drawer");
      if(frame===105)document.querySelector<HTMLButtonElement>('button[aria-label="Close panel"]')?.click();
      root.dataset.continuityFrame=String(frame);
    }
    return {samples,uiOpened};
  },start);
  await page.mouse.up();
  expect(observations.uiOpened).toBe(true);
  expect(observations.samples.every(sample=>sample.instances>0)).toBe(true);
  expect(new Set(observations.samples.map(sample=>`${sample.x}:${sample.z}`)).size).toBeGreaterThan(8);
  expect(observations.samples.some(sample=>sample.frame>30&&sample.closestTreeId&&sample.closestTreeLod===sample.closestTreeDesiredLod)).toBe(true);
  expect(observations.samples.some(sample=>sample.transitions>0)).toBe(true);
  expect(observations.samples.every(sample=>Number.isFinite(sample.pendingAgeMs)&&Number.isFinite(sample.cancelled))).toBe(true);
  await page.getByRole("button", { name: "Follow Alden", exact: true }).click();
  await expect(world).toHaveAttribute("data-voxel-queued", "0", { timeout: 30000 });
  await expect(world).toHaveAttribute("data-voxel-staged-cells", "0");
  await expect.poll(async () => {
    const d=await world.evaluate(root=>({...root.dataset}));return d.voxelClosestTreeId&&d.voxelClosestTreeLod===d.voxelClosestTreeDesiredLod;
  },{timeout:30000}).toBeTruthy();
  await page.screenshot({path:`${output}/runtime-settled.png`});
  const glError=await canvas.evaluate(element=>(element as HTMLCanvasElement).getContext("webgl2")!.getError());expect(glError).toBe(0);expect(errors).toEqual([]);
  await writeFile(`${output}/runtime-review.json`,JSON.stringify({position,...observations,glError,errors,note:"Actual production camera movement with 4x host CPU emulation; functional convergence/transition checks, not a physical-phone or universal frame-rate guarantee."},null,2));
  await cdp.detach();
});
