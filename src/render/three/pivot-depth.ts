/** Keep screen position/lighting geometry, but sort a cutout using its grounded pivot.
 * NDC depth is constant across the cutout in perspective and orthographic views.
 */
export function groundPivotDepthGLSL(worldPivot: string): string {
  return `
    vec3 fableDepthPivot=${worldPivot};
    #ifdef FABLE_WORLD_CURVE
      fableDepthPivot=fableCurvePoint(fableDepthPivot);
    #endif
    vec4 fableGroundClip=projectionMatrix*viewMatrix*vec4(fableDepthPivot,1.0);
    gl_Position.z=(fableGroundClip.z/fableGroundClip.w)*gl_Position.w;
  `;
}
