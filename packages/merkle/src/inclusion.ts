import { isHash, nodeHash } from "./hash.js";
import { assertLeafHashes, splitSize, subtreeRoot } from "./tree.js";

// RFC 9162 §2.1.3.1: sibling subtree roots are emitted from leaf to root.
export function createInclusionProof(
  leafHashes: readonly Uint8Array[],
  leafIndex: number,
): Uint8Array<ArrayBuffer>[] {
  assertLeafHashes(leafHashes);
  if (!Number.isSafeInteger(leafIndex) || leafIndex < 0 || leafIndex >= leafHashes.length) {
    throw new RangeError("Leaf index must identify an existing leaf");
  }
  function path(start: number, end: number): Uint8Array<ArrayBuffer>[] {
    if (end - start === 1) return [];
    const middle = start + splitSize(end - start);
    return leafIndex < middle
      ? [...path(start, middle), subtreeRoot(leafHashes, middle, end)]
      : [...path(middle, end), subtreeRoot(leafHashes, start, middle)];
  }
  return path(0, leafHashes.length);
}

export interface InclusionInput {
  readonly leafHash: Uint8Array;
  readonly leafIndex: number;
  readonly treeSize: number;
  readonly rootHash: Uint8Array;
  readonly proof: readonly Uint8Array[];
}

// RFC 9162 §2.1.3.2. Arithmetic division preserves indices beyond 32 bits.
export function verifyInclusion(input: InclusionInput): boolean {
  if (!input || typeof input !== "object") return false;
  const { leafHash, leafIndex, treeSize, rootHash, proof } = input;
  if (
    !Number.isSafeInteger(treeSize) ||
    treeSize <= 0 ||
    !Number.isSafeInteger(leafIndex) ||
    leafIndex < 0 ||
    leafIndex >= treeSize ||
    !isHash(leafHash) ||
    !isHash(rootHash) ||
    !Array.isArray(proof) ||
    proof.length > 53
  )
    return false;
  for (const hash of proof) if (!isHash(hash)) return false;

  let fn = leafIndex;
  let sn = treeSize - 1;
  let root = leafHash;
  for (const sibling of proof) {
    if (sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      root = nodeHash(sibling, root);
      while (fn !== 0 && fn % 2 === 0) {
        fn = Math.floor(fn / 2);
        sn = Math.floor(sn / 2);
      }
    } else {
      root = nodeHash(root, sibling);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && root.every((byte, index) => byte === rootHash[index]);
}
