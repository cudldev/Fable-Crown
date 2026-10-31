/** Shared sky/geometry tint keeps the far cutoff inside the same atmosphere. */
export const FOG_GRADIENT_GLSL = `
vec3 fableGradient(vec3 base,vec3 low,vec3 high,float elevation,float amount){
 return mix(base,mix(low,high,smoothstep(-.85,-.12,elevation)),amount);
}`;
