import { Vector2, Vector3, type Box3, type Camera } from "three";

/** Logical-space horizon shared by world fragments, CPU culling and interaction.
 * Curving vertices must never bring distant/behind-camera targets back into view.
 */
export class ViewDistance {
  readonly center = new Vector2();
  readonly range = new Vector2(12, 24);
  readonly cameraPosition = new Vector3();
  readonly forward = new Vector3(0, 0, -1);
  enabled = false;
  get pickEnd() { return this.range.x + (this.range.y - this.range.x) * .86; }
  update(camera: Camera, target: Vector3, span: number, fogReach: number, overview: boolean) {
    this.enabled = !overview; this.center.set(target.x, target.z);
    this.cameraPosition.copy(camera.position); camera.getWorldDirection(this.forward);
    const groundDistance = Math.hypot(camera.position.x - target.x, camera.position.z - target.z);
    const end = Math.max(12, Math.min(fogReach, Math.max(24, span * 1.5), groundDistance * .9));
    this.range.set(end * .45, end);
  }
  contains(point: Vector3, radius = 0): boolean {
    if (!this.enabled) return true;
    const depth = (point.x - this.cameraPosition.x) * this.forward.x + (point.y - this.cameraPosition.y) * this.forward.y + (point.z - this.cameraPosition.z) * this.forward.z;
    return depth > -radius && Math.hypot(point.x - this.center.x, point.z - this.center.y) < this.range.y + radius;
  }
  pickable(point: Vector3): boolean {
    return this.contains(point) && (!this.enabled || Math.hypot(point.x - this.center.x, point.z - this.center.y) < this.pickEnd);
  }
  intersects(bounds: Box3): boolean {
    if (!this.enabled) return true;
    const x = Math.max(bounds.min.x, Math.min(bounds.max.x, this.center.x));
    const z = Math.max(bounds.min.z, Math.min(bounds.max.z, this.center.y));
    if (Math.hypot(x - this.center.x, z - this.center.y) >= this.range.y) return false;
    const f = this.forward, p = this.cameraPosition;
    return ((f.x >= 0 ? bounds.max.x : bounds.min.x) - p.x) * f.x
      + ((f.y >= 0 ? bounds.max.y : bounds.min.y) - p.y) * f.y
      + ((f.z >= 0 ? bounds.max.z : bounds.min.z) - p.z) * f.z > 0;
  }
}
