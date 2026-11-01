import {describe,expect,it} from "vitest";
import {InputModeTracker} from "../src/action/input-mode";
describe("input-device presentation",()=>{
  it("starts desktop without a touch dock and touch devices with one",()=>{expect(new InputModeTracker(false).touchControls).toBe(false);expect(new InputModeTracker(true).touchControls).toBe(true);});
  it("does not mistake idle connection or resting drift for controller use",()=>{const d=new InputModeTracker(true);expect(d.observePad([false],[0,0,0,0])).toBe(false);expect(d.observePad([false],[.04,-.03,.1,0])).toBe(false);expect(d.touchControls).toBe(true);});
  it("recognizes a pressed button and deliberate stick movement",()=>{const d=new InputModeTracker(true);expect(d.observePad([true],[0,0])).toBe(true);d.use("controller");expect(d.touchControls).toBe(false);expect(d.observePad([true],[0,0])).toBe(false);expect(d.observePad([true],[.6,0])).toBe(true);});
  it("touch resumes without an unchanged held controller immediately stealing focus",()=>{const d=new InputModeTracker(true);d.observePad([true],[.8,0]);d.use("controller");d.use("touch");expect(d.observePad([true],[.8,0])).toBe(false);expect(d.touchControls).toBe(true);d.observePad([false],[0,0]);expect(d.observePad([true],[0,0])).toBe(true);});
  it.each([true,false])("disconnect restores the appropriate controls (touch=%s)",touch=>{const d=new InputModeTracker(touch);d.use("controller");expect(d.disconnect()).toBe(true);expect(d.touchControls).toBe(touch);expect(d.mode).toBe(touch?"touch":"keyboard");});
  it("supports actual touch on a hybrid pointer device",()=>{const d=new InputModeTracker(false);d.use("touch");expect(d.touchControls).toBe(true);d.use("keyboard");expect(d.touchControls).toBe(false);});
});
