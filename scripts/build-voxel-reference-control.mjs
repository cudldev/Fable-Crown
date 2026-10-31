/** Local renderer comparison only. Never enables a shipping runtime flag or writes dist/. */
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, normalizePath } from "vite";
import ts from "typescript";

const workspace = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const root = await realpath(resolve(process.env.CONTROL_ROOT || process.cwd()));
const temporaryRoot = resolve(workspace, "tmp");
const requestedOutput = resolve(workspace, process.env.CONTROL_DIST || "tmp/voxel-static-control-dist");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const inside = (parent, child) => {
  const path = relative(parent, child);
  return path !== "" && !isAbsolute(path) && path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`);
};
const localPath = path => normalizePath(relative(workspace, path)) || ".";

// Resolve existing ancestors too: an output symlink must not let emptyOutDir escape tmp/.
async function physicalTarget(path) {
  try { return await realpath(path); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    const existing = await lstat(path).catch(missing => {
      if (missing.code !== "ENOENT") throw missing;
    });
    if (existing?.isSymbolicLink()) throw Error("Control output cannot contain a dangling symbolic link.");
    return resolve(await physicalTarget(dirname(path)), basename(path));
  }
}
if (root !== workspace && !inside(workspace, root)) throw Error("CONTROL_ROOT must be the workspace or a source copy inside it.");
if (!inside(temporaryRoot, requestedOutput)) throw Error("CONTROL_DIST must be a directory strictly inside workspace/tmp/.");
await mkdir(temporaryRoot, { recursive: true });
const physicalTemporaryRoot = await realpath(temporaryRoot);
if (localPath(physicalTemporaryRoot) !== "tmp") throw Error("Workspace tmp/ must not redirect elsewhere.");
const outDir = await physicalTarget(requestedOutput);
if (!inside(physicalTemporaryRoot, outDir) || outDir === root || inside(outDir, root)) throw Error("Unsafe control output directory; refusing emptyOutDir.");

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error(`Source/artifact snapshots require ordinary files: ${localPath(path)}`);
    if (entry.isDirectory()) result.push(...await files(path)); else result.push(path);
  }
  return result.sort();
}
async function snapshot(directory, relativeRoot) {
  const rows = [];
  for (const file of await files(directory)) rows.push([normalizePath(relative(relativeRoot, file)), sha(await readFile(file))]);
  return { hash: sha(JSON.stringify(rows)), files: Object.fromEntries(rows) };
}

const adapter = resolve(temporaryRoot, "voxel-reference-control-adapter.ts");
const sourceImport = file => {
  const path = normalizePath(relative(dirname(adapter), resolve(root, "src/render/three", file)));
  return JSON.stringify(path.startsWith(".") ? path : `./${path}`);
};
const adapterSource = `import type { Scene } from "three";
import { VoxelBuckets, VOXEL_VISIBLE_CELL_BUDGET, type VoxelStats } from ${sourceImport("voxel-buckets")};
import type { VoxelMeshes as StaticVoxelMeshes, VoxelMeshStats } from ${sourceImport("voxel-meshes")};

/** Local benchmark control only: streamed cubes under the current runtime. */
export class ReferenceVoxelMeshes implements Pick<StaticVoxelMeshes, "replace" | "setAO" | "update" | "beginWarmup" | "dispose" | "stats"> {
  private readonly reference: VoxelBuckets;
  private extended?: VoxelMeshStats;
  constructor(scene: Scene) {
    this.reference = new VoxelBuckets(scene, 48, 100000, VOXEL_VISIBLE_CELL_BUDGET, true);
  }
  get stats(): VoxelMeshStats {
    if (this.extended !== this.reference.stats) {
      const unsupported: Omit<VoxelMeshStats, keyof VoxelStats | "equivalentCells"> = {
        templates: NaN, templateBuilds: NaN, geometryBytes: NaN, instanceBytes: NaN,
        drawInstances: NaN, visibleTriangles: NaN, shadowTriangles: NaN,
      };
      this.extended = Object.assign(this.reference.stats, unsupported, { equivalentCells: this.reference.stats.instances });
    }
    return this.extended;
  }
  replace(...args: Parameters<StaticVoxelMeshes["replace"]>) { this.reference.replace(...args); }
  setAO(...args: Parameters<StaticVoxelMeshes["setAO"]>) { this.reference.setAO(...args); }
  update(...args: Parameters<StaticVoxelMeshes["update"]>) { this.reference.update(...args); }
  beginWarmup(): ReturnType<StaticVoxelMeshes["beginWarmup"]> { return () => {}; }
  dispose() { this.reference.dispose(); }
}
`;
await writeFile(adapter, adapterSource);

// Strictly check the generated adapter against the selected source's public API.
const configuration = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
if (configuration.error) throw Error(ts.flattenDiagnosticMessageText(configuration.error.messageText, "\n"));
const config = ts.parseJsonConfigFileContent(configuration.config, ts.sys, root);
const program = ts.createProgram([adapter], { ...config.options, noEmit: true });
const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => workspace, getCanonicalFileName: file => file, getNewLine: () => "\n" }));

const source = await snapshot(resolve(root, "src"), root);
const runtime = normalizePath(resolve(root, "src/render/three/runtime.ts"));
let importReplacements = 0, labelReplacements = 0, runtimeOriginalHash, runtimeControlHash;
await build({
  root, configFile: resolve(root, "vite.config.ts"), base: process.env.VITE_BASE_PATH || "/Fable-Crown/",
  build: { outDir, emptyOutDir: true },
  plugins: [{
    name: "local-only-streamed-cube-reference-control", enforce: "pre",
    transform(code, id) {
      if (normalizePath(id.split("?")[0]) !== runtime) return;
      const importPattern = /import \{ VoxelMeshes \} from ["']\.\/voxel-meshes["'];/g;
      const labelPattern = /voxelRenderer: "shared-static-meshes"/g;
      if ([...code.matchAll(importPattern)].length !== 1 || [...code.matchAll(labelPattern)].length !== 1) throw Error("Expected exactly one renderer import and renderer diagnostic label.");
      const importText = `import { ReferenceVoxelMeshes as VoxelMeshes } from ${JSON.stringify(normalizePath(adapter))};`;
      const labelText = 'voxelRenderer: "cube-reference-control"';
      const originalImport = [...code.matchAll(importPattern)][0][0];
      const changed = code.replace(importPattern, () => { importReplacements++; return importText; })
        .replace(labelPattern, () => { labelReplacements++; return labelText; });
      if (changed.replace(importText, originalImport).replace(labelText, 'voxelRenderer: "shared-static-meshes"') !== code) throw Error("Control changed runtime content outside its two permitted replacements.");
      runtimeOriginalHash = sha(code);
      runtimeControlHash = sha(changed.replace(JSON.stringify(normalizePath(adapter)), JSON.stringify(localPath(adapter))));
      return { code: changed, map: null };
    },
  }],
});
if (importReplacements !== 1 || labelReplacements !== 1) throw Error(`Control transform mismatch: imports=${importReplacements}, labels=${labelReplacements}.`);
if ((await snapshot(resolve(root, "src"), root)).hash !== source.hash) throw Error("Source changed during control build; rerun against stable source.");

// No service worker is generated. The benchmark blocks SW but reads this asset manifest.
const manifestFile = resolve(root, "dist/world-assets.json");
await copyFile(manifestFile, resolve(outDir, "world-assets.json"));
const worldManifest = JSON.parse(await readFile(manifestFile, "utf8"));
for (const file of worldManifest.files) {
  const target = resolve(outDir, file.split("?")[0]);
  if (!inside(outDir, target)) throw Error("World asset manifest escapes the output directory.");
  await stat(target);
}
const bundle = await snapshot(resolve(outDir, "assets"), outDir);
const report = {
  id: `cube-control-${source.hash.slice(0, 12)}-${bundle.hash.slice(0, 12)}`,
  root: localPath(root), outDir: localPath(outDir), renderer: "cube-reference-control",
  base: process.env.VITE_BASE_PATH || "/Fable-Crown/", source, bundleHash: bundle.hash,
  adapter: localPath(adapter), adapterHash: sha(adapterSource), runtimeOriginalHash, runtimeControlHash,
  copiedWorldAssetVersion: worldManifest.version, strictAdapterTypecheck: "passed", importReplacements, labelReplacements,
  changes: ["runtime voxel renderer import redirected to ReferenceVoxelMeshes", "diagnostic voxelRenderer label"],
  unchanged: ["camera input", "VOX decode and surface baking", "workers", "loading", "lighting", "prefabs", "public assets"],
  serviceWorker: "not generated; benchmark must block service workers",
  incomparableMetrics: ["preparationMs: cube packing work versus static whole update", "static-only geometry/template/draw metrics are NaN in the cube control"],
};
await writeFile(resolve(outDir, "control-build.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ id: report.id, root: report.root, outDir: report.outDir, sourceHash: source.hash, bundleHash: bundle.hash, worldAssetVersion: worldManifest.version, strictAdapterTypecheck: report.strictAdapterTypecheck }));
