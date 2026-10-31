import { decodeVoxelBake } from "./voxel-bake";

/** Bounded native decompression and validation, called in the loading worker. */
export async function unpackVoxelBake(buffer: ArrayBuffer, sourceVersion: string, decodedBytes: number, sha256: string) {
  if (!(buffer instanceof ArrayBuffer) || !Number.isSafeInteger(decodedBytes) || decodedBytes < 1 || decodedBytes > 64 * 1024 * 1024) throw Error("Invalid voxel bake envelope.");
  const actualHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)), byte => byte.toString(16).padStart(2, "0")).join("");
  if (actualHash !== sha256) throw Error("Baked voxel content hash differs from this build.");
  const reader = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > decodedBytes) throw Error("Voxel bake expanded beyond its declared size.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  if (bytes !== decodedBytes) throw Error("Voxel bake size differs from this build.");
  const decoded = new Uint8Array(bytes); let at = 0;
  for (const chunk of chunks) { decoded.set(chunk, at); at += chunk.length; }
  return decodeVoxelBake(decoded.buffer, sourceVersion);
}
