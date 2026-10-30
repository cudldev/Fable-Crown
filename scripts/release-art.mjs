import { readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";

// Keep authoring history in public/; only current renderer assets ship to Pages.
const manifest = JSON.parse(await readFile("dist/art3d/manifest.json", "utf8"));
manifest.assets = manifest.assets.filter(asset => !["alden", "tree"].includes(asset.id));
manifest.files = manifest.files.filter(file => !["art3d/alden.glb", "art3d/tree.glb"].includes(file));
manifest.version = createHash("sha256").update(JSON.stringify(manifest.assets)).digest("hex").slice(0, 16);
await writeFile("dist/art3d/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
const output = resolve("dist");
for (const path of ["dist/art", "dist/art3d/ink", "dist/art3d/fitted", "dist/art3d/alden.glb", "dist/art3d/tree.glb"]) {
  const target = resolve(path);
  if (!target.startsWith(output + sep)) throw Error("Release cleanup escaped dist");
  await rm(target, { recursive: true, force: true });
}
console.log("Release art: voxel world, pixel cast and remaining environment models only.");
