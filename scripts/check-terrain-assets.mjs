import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Validate exact native cell data before it is accepted as the editable flat terrain source. */
export function validateTerrainModule(raw, spec) {
  const fail = message => { throw Error(`${spec.id}: ${message}`); };
  if (raw.length < 20 || raw.toString('ascii', 0, 4) !== 'VOX ' || raw.readUInt32LE(4) !== 150 || raw.toString('ascii', 8, 12) !== 'MAIN' || raw.readUInt32LE(12) !== 0 || 20 + raw.readUInt32LE(16) !== raw.length) fail('invalid native VOX150 root');
  const parts = new Map();
  for (let at = 20; at < raw.length;) {
    if (at + 12 > raw.length) fail('truncated chunk header');
    const kind = raw.toString('ascii', at, at + 4), length = raw.readUInt32LE(at + 4), children = raw.readUInt32LE(at + 8);
    if (children || at + 12 + length > raw.length) fail('nested/truncated chunk');
    if (['SIZE', 'XYZI', 'RGBA', 'PACK'].includes(kind)) {
      if (parts.has(kind)) fail('multiple models/repeated voxel data');
      parts.set(kind, raw.subarray(at + 12, at + 12 + length));
    }
    at += 12 + length;
  }
  const size = parts.get('SIZE'), cells = parts.get('XYZI'), rgba = parts.get('RGBA'), pack = parts.get('PACK');
  if (!size || size.length !== 12 || !cells || cells.length < 4 || !rgba || rgba.length !== 1024) fail('missing voxel grid or explicit palette');
  if (pack && (pack.length !== 4 || pack.readUInt32LE(0) !== 1)) fail('expected one model');
  const dimensions = [0, 4, 8].map(at => size.readUInt32LE(at));
  if (dimensions.join(',') !== '16,16,8' || spec.size?.join(',') !== dimensions.join(',') || spec.pitch !== .0625) fail('changed one-metre frame/density');
  const stair = spec.shape === 'stair';
  if (!['flat', 'stair'].includes(spec.shape) || spec.pivot?.join(',') !== (stair ? '8,8,0' : '8,8,8')) fail('invalid support shape or pivot');
  const count = cells.readUInt32LE(0), seen = new Uint8Array(2048), tops = new Int8Array(256).fill(-1);
  if (!count || count > 2048 || count !== spec.cells || cells.length !== 4 + count * 4) fail('occupied cell count disagrees');
  for (let i = 0; i < count; i++) {
    const at = 4 + i * 4, x = cells[at], y = cells[at + 1], z = cells[at + 2], color = cells[at + 3], key = (x * 16 + y) * 8 + z;
    if (x >= 16 || y >= 16 || z >= 8 || !color || seen[key] || rgba[(color - 1) * 4 + 3] !== 255) fail('out-of-bounds/duplicate/translucent occupied cell');
    seen[key] = 1; tops[x * 16 + y] = Math.max(tops[x * 16 + y], z);
  }
  for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) if (tops[x * 16 + y] !== (stair ? (Math.floor(x / 4) + 1) * 2 - 1 : 7)) fail('flat top/stair socket no longer matches metadata');
}

export function terrainVersion(manifest, pack) {
  return createHash('sha256').update(JSON.stringify({ ...manifest, version: undefined })).update(pack).digest('hex').slice(0, 16);
}

/** Publication is local-only, an exact concatenation of editable source files, not a new model format. */
export function validateTerrainPack(manifest, pack) {
  if (!manifest || manifest.pack !== 'tiles.bin' || JSON.stringify(manifest.files) !== JSON.stringify(['art3d/terrain/tiles.bin']) || manifest.bytes !== pack.length || manifest.pitch !== .0625 || manifest.tileMetres !== 1 || manifest.variantPeriod !== 4 || manifest.levelMetres !== .5) throw Error('Invalid terrain publication contract');
  if (!Array.isArray(manifest.assets) || !manifest.assets.length || manifest.assets.length > 4096 || !manifest.variants || typeof manifest.variants !== 'object' || !/^[a-f0-9]{16}$/.test(manifest.sourceVersion)) throw Error('Missing terrain source metadata');
  const ids = new Map(); let end = 0;
  for (const spec of manifest.assets) {
    if (typeof spec.id !== 'string' || !/^[a-z0-9-]+$/.test(spec.id) || ids.has(spec.id) || spec.file !== spec.id + '.vox') throw Error('Invalid/repeated local terrain source');
    if (!Number.isSafeInteger(spec.byteOffset) || spec.byteOffset !== end || !Number.isSafeInteger(spec.byteLength) || spec.byteLength < 20 || spec.byteOffset + spec.byteLength > pack.length) throw Error('Terrain pack offsets overlap, skip bytes or escape the bundle');
    validateTerrainModule(pack.subarray(spec.byteOffset, spec.byteOffset + spec.byteLength), spec);
    ids.set(spec.id, spec); end += spec.byteLength;
  }
  if (end !== pack.length) throw Error('Terrain pack has undeclared trailing data');
  for (const family of ['grass', 'dirt', 'cobble', 'sand']) if (!(family in manifest.variants)) throw Error('Missing terrain material ' + family);
  for (const [family, variants] of Object.entries(manifest.variants)) {
    if (!/^[a-z0-9-]+$/.test(family) || !Array.isArray(variants) || variants.length !== 16 || new Set(variants).size !== 16) throw Error('Invalid terrain phase table');
    variants.forEach((id, index) => { if (!ids.has(id) || ids.get(id).phase?.join(',') !== [index % 4, Math.floor(index / 4)].join(',')) throw Error('Terrain phase references disagree'); });
  }
  if (manifest.packSha256 !== createHash('sha256').update(pack).digest('hex') || manifest.version !== terrainVersion(manifest, pack)) throw Error('Terrain bundle/metadata hash is stale');
  return { modules: ids.size, bytes: pack.length, version: manifest.version };
}

export async function checkTerrainAssets(folder = 'public/art3d/terrain') {
  const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
  const pack = await readFile(path.join(folder, 'tiles.bin'));
  return validateTerrainPack(manifest, pack);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkTerrainAssets(process.argv.includes('--dist') ? 'dist/art3d/terrain' : undefined);
  console.log(`Native terrain publication verified: ${result.modules} modules, ${result.bytes} bytes, ${result.version}`);
}
