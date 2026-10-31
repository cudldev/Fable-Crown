/** Mild barrel distortion, with a small crop so the frame never exposes borders. */
export const MAX_LENS_DISTORTION = .04;
interface Point { x: number; y: number }

/** Display NDC -> undistorted scene NDC; mirrored by the composite shader. */
export function lensToScene<T extends Point>(point: T, strength: number, aspect: number): T {
  const k = strength * MAX_LENS_DISTORTION;
  const radius2 = (point.x * point.x * aspect * aspect + point.y * point.y) / (aspect * aspect + 1);
  const scale = (1 + k * radius2) / (1 + k);
  point.x *= scale; point.y *= scale;
  return point;
}

/** Scene NDC -> display NDC for labels and accessible hit targets. */
export function lensToScreen<T extends Point>(point: T, strength: number, aspect: number): T {
  if (strength === 0) return point;
  const k = strength * MAX_LENS_DISTORTION;
  const radius2 = (point.x * point.x * aspect * aspect + point.y * point.y) / (aspect * aspect + 1);
  // Solve scale + k * radius² * scale³ = 1 + k. Monotonic for our positive range.
  let scale = 1;
  for (let i = 0; i < 5; i++) scale -= (scale + k * radius2 * scale ** 3 - 1 - k) / (1 + 3 * k * radius2 * scale * scale);
  point.x *= scale; point.y *= scale;
  return point;
}
