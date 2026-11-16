import { assertHash, emptyRoot, nodeHash } from "./hash.js";

export function assertLeafHashes(leafHashes: readonly Uint8Array[]): void {
  if (!Array.isArray(leafHashes)) throw new TypeError("Leaf hashes must be an array");
  for (const hash of leafHashes) assertHash(hash);
}

export function splitSize(size: number): number {
  let split = 1;
  while (split * 2 < size) split *= 2;
  return split;
}

// RFC 9162 §2.1.1: split at the largest power of two strictly below the size.
export function subtreeRoot(
  leafHashes: readonly Uint8Array[],
  start: number,
  end: number,
): Uint8Array<ArrayBuffer> {
  const size = end - start;
  if (size === 0) return emptyRoot();
  if (size === 1) {
    const hash = leafHashes[start];
    assertHash(hash);
    return new Uint8Array(hash);
  }
  const middle = start + splitSize(size);
  return nodeHash(subtreeRoot(leafHashes, start, middle), subtreeRoot(leafHashes, middle, end));
}

export function rootFromLeafHashes(leafHashes: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  assertLeafHashes(leafHashes);
  return subtreeRoot(leafHashes, 0, leafHashes.length);
}
