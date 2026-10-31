import { ClampToEdgeWrapping, DataTexture, LinearFilter, MeshLambertMaterial, NoColorSpace, RedFormat, Vector2, type WebGLProgramParametersWithUniforms } from "three";
import type { WorldDefinition } from "../../rpg/types";

const PITCH = 8;
/** Cached ground-only contact visibility; avoids screen-space cutout halos. */
export class ContactDetail {
  readonly strength = { value: .45 };
  readonly texture: DataTexture;
  private uniforms: Record<string, { value: unknown }>;
  constructor(world: WorldDefinition) {
    const width = world.width * PITCH, height = world.height * PITCH, data = new Uint8Array(width * height);
    for (const object of world.objects) {
      if (["landmark", "clue", "fish", "ferry", "bridge", "quest", "target"].includes(object.kind)) continue;
      const rectangle = ["bank", "building", "shop", "furnace", "decor", "range", "anvil"].includes(object.kind);
      const x0 = object.position.x - .5, z0 = object.position.y - .5;
      const cx = object.position.x + (object.width - 1) / 2, cz = object.position.y + (object.height - 1) / 2;
      const fence = object.kind === "fence" || object.kind === "gate";
      const reach = object.kind === "tree" ? .65 : fence || object.kind === "sign" ? .28 : .38;
      for (let z = Math.max(0, Math.floor((z0 - reach + .5) * PITCH)); z < Math.min(height, Math.ceil((z0 + object.height + reach + .5) * PITCH)); z++) {
        for (let x = Math.max(0, Math.floor((x0 - reach + .5) * PITCH)); x < Math.min(width, Math.ceil((x0 + object.width + reach + .5) * PITCH)); x++) {
          const wx = (x + .5) / PITCH - .5, wz = (z + .5) / PITCH - .5;
          const distance = rectangle ? Math.hypot(Math.max(0, x0 - wx, wx - x0 - object.width), Math.max(0, z0 - wz, wz - z0 - object.height))
            : fence ? Math.min(...[-.44, .44].map(offset => Math.hypot(wx - cx - (object.orientation === "y" ? 0 : offset), wz - cz - (object.orientation === "y" ? offset : 0))))
            : Math.hypot(wx - cx, wz - cz);
          const amount = Math.max(0, 1 - distance / reach); if (!amount) continue;
          const at = z * width + x; data[at] = Math.max(data[at], Math.round(255 * amount * amount));
        }
      }
    }
    this.texture = new DataTexture(data, width, height, RedFormat); this.texture.name = "cached-ground-contact";
    this.texture.colorSpace = NoColorSpace; this.texture.minFilter = this.texture.magFilter = LinearFilter;
    this.texture.wrapS = this.texture.wrapT = ClampToEdgeWrapping; this.texture.generateMipmaps = false; this.texture.needsUpdate = true;
    this.uniforms = { fableContactMap: { value: this.texture }, fableContactSize: { value: new Vector2(world.width, world.height) }, fableContactStrength: this.strength };
  }
  decorate(material: MeshLambertMaterial) {
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
      compile.call(material, shader, renderer); Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = "varying vec2 vFableContact; uniform vec2 fableContactSize;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        vFableContact=((modelMatrix*vec4(position,1.0)).xz+vec2(.5))/fableContactSize;`);
      shader.fragmentShader = "varying vec2 vFableContact; uniform sampler2D fableContactMap; uniform float fableContactStrength;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
        outgoingLight*=1.0-texture2D(fableContactMap,vFableContact).r*fableContactStrength*.48;
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => key.call(material) + "|ground-contact-v1"; material.needsUpdate = true;
  }
  dispose() {
    this.texture.dispose();
    // Decorator registries may retain disposed materials until runtime cleanup.
    this.texture.image.data = new Uint8Array(1); this.texture.image.width = this.texture.image.height = 1;
  }
}

/** Soft foot contact, shared by the whole cast. White RGB, radial alpha. */
export function footContactPixels(size = 32): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1);
    data.set([255, 255, 255, Math.round(255 * Math.max(0, 1 - radius) ** 1.6)], (y * size + x) * 4);
  }
  return data;
}
