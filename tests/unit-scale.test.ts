import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createUnitSheet, createHeldUnitSheet, UNIT_KINDS } from '../src/render/pixel-units';
import { pixelUnitGeometry, samplePixelUnitPose } from '../src/render/pixel-canvas';
import { UNIT_PIXEL_METRES, UNIT_CANVAS_CELL_PIXELS, unitCanvasHeight, unitWorldFrame } from '../src/render/unit-scale';
describe('cast shares the scenery voxel grid', () => {
  it('matches the published terrain and prop voxel pitch', () => {
    for (const path of ['public/art3d/voxel/manifest.json','public/art3d/terrain/manifest.json']) {
      const data = JSON.parse(readFileSync(path, 'utf8')) as { assets: { pitch: number }[] };
      expect(data.assets.length).toBeGreaterThan(0);
      for (const asset of data.assets) expect(asset.pitch).toBe(UNIT_PIXEL_METRES);
    }
  });
  it('keeps every body and tool cell on the same metre scale without fitting species independently', () => {
    for (const kind of UNIT_KINDS) {
      const body=createUnitSheet(kind,0), held=createHeldUnitSheet(kind,0,'sword');
      const frame=unitWorldFrame(body);
      expect(frame.span/body.frameSize).toBe(1/16);
      expect(frame.span).toBe(2);
      expect(unitWorldFrame(held)).toEqual(frame);
      expect(frame.y + frame.span/2 - body.footY * frame.pitch).toBe(0);
      expect(frame.x - frame.span/2 + body.footX * frame.pitch).toBe(0);
      expect(frame.bodyHeight).toBe((kind==='boar'?14:kind==='rock-mite'?12:18)/16);
    }
  });
  it('uses the isometric horizontal metre scale for both Canvas layers and grounds the shared foot pivot', () => {
    for (const kind of UNIT_KINDS) {
      const body=createUnitSheet(kind,0);
      const geometry=pixelUnitGeometry(body,unitCanvasHeight(body.bodyHeight),samplePixelUnitPose({}));
      expect(geometry.width/body.frameSize).toBeCloseTo(UNIT_CANVAS_CELL_PIXELS);
      expect(geometry.left + body.footX*UNIT_CANVAS_CELL_PIXELS).toBeCloseTo(0);
      expect(geometry.top + body.footY*UNIT_CANVAS_CELL_PIXELS).toBeCloseTo(0);
    }
  });
});
