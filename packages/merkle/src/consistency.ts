import { isHash, nodeHash } from "./hash.js";
import { assertLeafHashes, splitSize, subtreeRoot } from "./tree.js";

// RFC bound ceil(log2(n)) + 1 for safe integer tree sizes.
const MAX_PROOF_NODES = 54;

// RFC 9162 §2.1.4.1: SUBPROOF tracks whether the old subtree root is known.
export function createConsistencyProof(
  leafHashes: readonly Uint8Array[],
  firstSize: number,
): Uint8Array<ArrayBuffer>[] {
  assertLeafHashes(leafHashes);
  if (!Number.isSafeInteger(firstSize) || firstSize <= 0 || firstSize > leafHashes.length) {
    throw new RangeError("First tree size must be positive and no larger than the current tree");
  }
  function subproof(
    start: number,
    end: number,
    first: number,
    known: boolean,
  ): Uint8Array<ArrayBuffer>[] {
    if (first === end - start) return known ? [] : [subtreeRoot(leafHashes, start, end)];
    const split = splitSize(end - start);
    const middle = start + split;
    return first <= split
      ? [...subproof(start, middle, first, known), subtreeRoot(leafHashes, middle, end)]
      : [...subproof(middle, end, first - split, false), subtreeRoot(leafHashes, start, middle)];
  }
  return subproof(0, leafHashes.length, firstSize, true);
}

export interface ConsistencyInput {
  readonly firstSize: number;
  readonly secondSize: number;
  readonly firstRoot: Uint8Array;
  readonly secondRoot: Uint8Array;
  readonly proof: readonly Uint8Array[];
}

// RFC 9162 §2.1.4.2. Equal-size trees use the explicitly approved empty-proof rule.
export function verifyConsistency(input: ConsistencyInput): boolean {
  if (!input || typeof input !== "object") return false;
  const { firstSize, secondSize, firstRoot, secondRoot, proof } = input;
  if (
    !Number.isSafeInteger(firstSize) ||
    firstSize <= 0 ||
    !Number.isSafeInteger(secondSize) ||
    secondSize < firstSize ||
    !isHash(firstRoot) ||
    !isHash(secondRoot) ||
    !Array.isArray(proof) ||
    proof.length > MAX_PROOF_NODES
  )
    return false;
  for (const hash of proof) if (!isHash(hash)) return false;
  if (firstSize === secondSize) {
    return proof.length === 0 && firstRoot.every((byte, index) => byte === secondRoot[index]);
  }
  if (proof.length === 0) return false;

  let fn = firstSize - 1;
  let sn = secondSize - 1;
  while (fn % 2 === 1) {
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  let before = firstRoot;
  let after = firstRoot;
  let cursor = 0;
  // A power-of-two old tree starts with its known root instead of a proof node.
  if (fn !== 0) {
    const initial = proof[0];
    if (!isHash(initial)) return false;
    before = initial;
    after = initial;
    cursor = 1;
  }
  for (; cursor < proof.length; cursor++) {
    const sibling = proof[cursor];
    if (!sibling || sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      before = nodeHash(sibling, before);
      after = nodeHash(sibling, after);
      while (fn !== 0 && fn % 2 === 0) {
        fn = Math.floor(fn / 2);
        sn = Math.floor(sn / 2);
      }
    } else {
      after = nodeHash(after, sibling);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return (
    sn === 0 &&
    before.every((byte, index) => byte === firstRoot[index]) &&
    after.every((byte, index) => byte === secondRoot[index])
  );
}
