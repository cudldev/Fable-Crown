import {expect,test} from "vitest";
import {FollowCamera,FOLLOW_CAMERA_MAX_LEAD} from "../src/render/follow-camera";

test("always anchors at the player and gently leads actual travel",()=>{
  const camera=new FollowCamera();expect(camera.update({x:10,z:20},0)).toEqual({x:10,z:20,leadX:0,leadZ:0});
  let pose=camera.update({x:10.05,z:20},1000/60);
  expect(pose.leadX).toBeGreaterThan(0);expect(pose.leadX).toBeLessThan(.1);expect(pose.z).toBe(20);
  for(let i=2;i<=120;i++)pose=camera.update({x:10+i*.05,z:20},i*1000/60);
  expect(pose.x).toBeGreaterThan(16.9);expect(pose.leadX).toBeLessThanOrEqual(FOLLOW_CAMERA_MAX_LEAD);
});

test("diagonal movement obeys the same radial cap and reversals are eased",()=>{
  const camera=new FollowCamera();camera.update({x:0,z:0},0);
  let pose=camera.update({x:0,z:0},0);
  for(let i=1;i<=120;i++)pose=camera.update({x:i*.1,z:i*.1},i*1000/60);
  expect(Math.hypot(pose.leadX,pose.leadZ)).toBeCloseTo(FOLLOW_CAMERA_MAX_LEAD,3);
  const reversed=camera.update({x:11.9,z:11.9},121*1000/60);
  expect(reversed.leadX).toBeGreaterThan(0);expect(reversed.leadX).toBeLessThan(pose.leadX);
});

test("stationary actors settle exactly without retaining a parked offset",()=>{
  const camera=new FollowCamera();camera.update({x:0,z:0},0);
  for(let i=1;i<=60;i++)camera.update({x:i*.05,z:0},i*1000/60);
  let pose=camera.update({x:3,z:0},1016.6667);
  for(let i=62;i<=300;i++)pose=camera.update({x:3,z:0},i*1000/60);
  expect(pose).toEqual({x:3,z:0,leadX:0,leadZ:0});
});

test("lead is independent of rendering rate at a steady movement speed",()=>{
  function run(hz:number){const camera=new FollowCamera();camera.update({x:0,z:0},0);let pose=camera.update({x:0,z:0},0);for(let i=1;i<=hz;i++)pose=camera.update({x:3*i/hz,z:-2*i/hz},i*1000/hz);return pose;}
  const slow=run(30),fast=run(144);expect(slow.x).toBeCloseTo(fast.x,10);expect(slow.z).toBeCloseTo(fast.z,10);
});

test("teleports, suspension and reduced motion clear the lead immediately",()=>{
  const camera=new FollowCamera();camera.update({x:0,z:0},0);camera.update({x:.1,z:0},16);
  expect(camera.update({x:80,z:40},32)).toEqual({x:80,z:40,leadX:0,leadZ:0});
  camera.update({x:80.1,z:40},48);expect(camera.update({x:80.1,z:40},2000).leadX).toBe(0);
  camera.update({x:80.2,z:40},2016);expect(camera.update({x:80.3,z:40},2032,true).leadX).toBe(0);
  camera.reset();expect(camera.update({x:2,z:4},2048)).toEqual({x:2,z:4,leadX:0,leadZ:0});
});
