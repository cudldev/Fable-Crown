// Isolated authored-asset gate. The baseline seven-model manifest is unchanged.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as zlib from "node:zlib";
import { inspectGlb, INK_STUDY_SPEC } from "./check-art3d.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function checkInkStudy({ write = false } = {}) {
  const file = "art3d/ink/alden-ink.glb", source = "assets/source/3d/alden-ink.blend";
  const buffer = await readFile(resolve(root, "public", file));
  const metrics = inspectGlb(buffer, "alden-ink");
  const blend = await readFile(resolve(root, source));
  let unpacked = blend;
  if (blend.readUInt32LE(0) === 0xfd2fb528) {
    if (typeof zlib.zstdDecompressSync !== "function") throw Error("Checking compressed Blender sources requires Node22.15+.");
    unpacked = zlib.zstdDecompressSync(blend);
  } else if (blend[0] === 31 && blend[1] === 139) unpacked = zlib.gunzipSync(blend);
  if (unpacked.length <= 12 || unpacked.toString("ascii", 0, 7) !== "BLENDER") throw Error("alden-ink: editable Blender source is invalid.");
  const manifest = {
    version: createHash("sha256").update(file).update(buffer).digest("hex").slice(0, 16),
    files: [file], bytes: buffer.length,
    asset: { id: "alden-ink", url: "alden-ink.glb", source, footprint: INK_STUDY_SPEC.footprint, requiredNodes: INK_STUDY_SPEC.requiredNodes, ...metrics },
  };
  const target = resolve(root, "public/art3d/ink/manifest.json");
  if (write) await writeFile(target, JSON.stringify(manifest, null, 2) + "\n");
  else if (JSON.stringify(JSON.parse(await readFile(target, "utf8"))) !== JSON.stringify(manifest)) throw Error("Ink study manifest is stale; run node scripts/check-ink-study.mjs --write.");
  return manifest;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.slice(2).some(argument => argument !== "--write")) throw Error("Usage: node scripts/check-ink-study.mjs [--write]");
    const result = await checkInkStudy({ write: process.argv.includes("--write") });
    console.log(`Ink study checked: ${result.asset.triangles} triangles, ${result.asset.nodes} nodes, ${result.bytes} bytes, version ${result.version}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
  }
}
