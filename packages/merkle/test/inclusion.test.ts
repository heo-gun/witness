import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "@tlog/shared";
import { createInclusionProof, leafHash, nodeHash, verifyInclusion } from "../src/index.js";
import type { InclusionInput } from "../src/index.js";
import { entries, expectedRoot, inclusions } from "./fixtures.js";

const leafHashes = entries.map(leafHash);

function at(index: number): Uint8Array {
  const hash = leafHashes[index];
  if (!hash) throw new Error("Missing fixture leaf");
  return hash;
}

function corrupted(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes);
  copy[0] = (copy[0] ?? 0) ^ 0x01;
  return copy;
}

describe("RFC 9162 §2.1.3 inclusion proofs", () => {
  it("covers every leaf at tree sizes 1 through 64", () => {
    const cases = Array.from({ length: 64 }, (_, n) =>
      Array.from({ length: n + 1 }, (_, index) => `${n + 1}:${index}`),
    ).flat();
    expect(inclusions.map(({ treeSize, leafIndex }) => `${treeSize}:${leafIndex}`)).toEqual(cases);
  });

  it.each(inclusions)(
    "matches and verifies independent proof $treeSize:$leafIndex",
    ({ treeSize, leafIndex, proof }) => {
      const generated = createInclusionProof(leafHashes.slice(0, treeSize), leafIndex);
      expect(generated.map(bytesToHex)).toEqual(proof);
      const input: InclusionInput = {
        leafHash: at(leafIndex),
        leafIndex,
        treeSize,
        rootHash: expectedRoot(treeSize),
        proof: proof.map((hex) => hexToBytes(hex, 32)),
      };
      expect(verifyInclusion(input)).toBe(true);
      expect(verifyInclusion({ ...input, rootHash: corrupted(input.rootHash) })).toBe(false);
      expect(verifyInclusion({ ...input, leafHash: corrupted(input.leafHash) })).toBe(false);
      expect(verifyInclusion({ ...input, proof: [...input.proof, at(0)] })).toBe(false);
      if (treeSize > 1) {
        expect(verifyInclusion({ ...input, leafIndex: (leafIndex + 1) % treeSize })).toBe(false);
        expect(verifyInclusion({ ...input, proof: input.proof.slice(0, -1) })).toBe(false);
      }
      for (let index = 0; index < input.proof.length; index++) {
        expect(
          verifyInclusion({
            ...input,
            proof: input.proof.map((hash, i) => (i === index ? corrupted(hash) : hash)),
          }),
        ).toBe(false);
      }
    },
  );

  it("rejects invalid metadata, hash lengths, sparse paths and excess nodes", () => {
    const input: InclusionInput = {
      leafHash: at(0),
      leafIndex: 0,
      treeSize: 1,
      rootHash: at(0),
      proof: [],
    };
    for (const treeSize of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(verifyInclusion({ ...input, treeSize })).toBe(false);
    }
    for (const leafIndex of [-1, 1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(verifyInclusion({ ...input, leafIndex })).toBe(false);
    }
    for (const length of [0, 31, 33]) {
      expect(verifyInclusion({ ...input, leafHash: new Uint8Array(length) })).toBe(false);
      expect(verifyInclusion({ ...input, rootHash: new Uint8Array(length) })).toBe(false);
      expect(verifyInclusion({ ...input, treeSize: 2, proof: [new Uint8Array(length)] })).toBe(
        false,
      );
    }
    expect(verifyInclusion({ ...input, proof: new Array<Uint8Array>(1) })).toBe(false);
    expect(
      verifyInclusion({
        ...input,
        treeSize: Number.MAX_SAFE_INTEGER,
        proof: Array.from({ length: 54 }, () => at(0)),
      }),
    ).toBe(false);
    expect(verifyInclusion(null as unknown as InclusionInput)).toBe(false);
  });

  it.each([-1, 0.5, NaN, Infinity, 64, Number.MAX_SAFE_INTEGER])(
    "rejects invalid generator index %s",
    (index) => {
      expect(() => createInclusionProof(leafHashes, index)).toThrow(RangeError);
    },
  );

  it("cannot generate an inclusion proof for an empty tree or invalid hashes", () => {
    expect(() => createInclusionProof([], 0)).toThrow(RangeError);
    expect(() => createInclusionProof([new Uint8Array(31)], 0)).toThrow(TypeError);
  });

  it("does not return aliases or mutate hashes during generation and verification", () => {
    const hashes = [new Uint8Array(at(0)), new Uint8Array(at(1))];
    const before = hashes.map(bytesToHex);
    const proof = createInclusionProof(hashes, 0);
    expect(
      verifyInclusion({
        leafHash: at(0),
        leafIndex: 0,
        treeSize: 2,
        rootHash: expectedRoot(2),
        proof,
      }),
    ).toBe(true);
    const sibling = proof[0];
    if (!sibling) throw new Error("Expected one proof node");
    sibling[0] = (sibling[0] ?? 0) ^ 0xff;
    expect(hashes.map(bytesToHex)).toEqual(before);
  });

  it.each([32, 52])("preserves %s-bit indices without 32-bit truncation", (bits) => {
    const treeSize = 2 ** bits;
    const proof = Array.from({ length: bits }, (_, index) => at(index));
    const rootHash = proof.reduce((root, sibling) => nodeHash(sibling, root), at(0));
    expect(
      verifyInclusion({ leafHash: at(0), leafIndex: treeSize - 1, treeSize, rootHash, proof }),
    ).toBe(true);
    expect(
      verifyInclusion({
        leafHash: at(0),
        leafIndex: treeSize - 1,
        treeSize,
        rootHash,
        proof: proof.slice(0, -1),
      }),
    ).toBe(false);
  });
});
