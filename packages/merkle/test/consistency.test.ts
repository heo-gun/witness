import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "@tlog/shared";
import { createConsistencyProof, leafHash, nodeHash, verifyConsistency } from "../src/index.js";
import type { ConsistencyInput } from "../src/index.js";
import { consistencies, entries, expectedRoot } from "./fixtures.js";

const leafHashes = entries.map(leafHash);
function at(index: number): Uint8Array {
  const hash = leafHashes[index];
  if (!hash) throw new Error("Missing fixture leaf");
  return hash;
}
function corrupted(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes);
  copy[0] = (copy[0] ?? 0) ^ 1;
  return copy;
}

describe("RFC 9162 §2.1.4 consistency proofs", () => {
  it("covers all increasing pairs of positive tree sizes through 64", () => {
    const cases = Array.from({ length: 64 }, (_, n) =>
      Array.from({ length: n }, (_, index) => `${index + 1}:${n + 1}`),
    ).flat();
    expect(consistencies.map(({ first, second }) => `${first}:${second}`)).toEqual(cases);
  });

  it.each(consistencies)(
    "matches and verifies independent proof $first:$second",
    ({ first, second, proof }) => {
      const generated = createConsistencyProof(leafHashes.slice(0, second), first);
      expect(generated.map(bytesToHex)).toEqual(proof);
      const input: ConsistencyInput = {
        firstSize: first,
        secondSize: second,
        firstRoot: expectedRoot(first),
        secondRoot: expectedRoot(second),
        proof: Object.freeze(proof.map((hex) => hexToBytes(hex, 32))),
      };
      expect(verifyConsistency(input)).toBe(true);
      expect(verifyConsistency({ ...input, firstRoot: corrupted(input.firstRoot) })).toBe(false);
      expect(verifyConsistency({ ...input, secondRoot: corrupted(input.secondRoot) })).toBe(false);
      expect(verifyConsistency({ ...input, proof: input.proof.slice(0, -1) })).toBe(false);
      expect(verifyConsistency({ ...input, proof: [...input.proof, at(0)] })).toBe(false);
      for (let index = 0; index < input.proof.length; index++) {
        expect(
          verifyConsistency({
            ...input,
            proof: input.proof.map((hash, i) => (i === index ? corrupted(hash) : hash)),
          }),
        ).toBe(false);
      }
    },
  );

  it.each(Array.from({ length: 64 }, (_, n) => n + 1))(
    "requires an empty proof and equal roots for unchanged size %s",
    (size) => {
      expect(createConsistencyProof(leafHashes.slice(0, size), size)).toEqual([]);
      const input: ConsistencyInput = {
        firstSize: size,
        secondSize: size,
        firstRoot: expectedRoot(size),
        secondRoot: new Uint8Array(expectedRoot(size)),
        proof: [],
      };
      expect(verifyConsistency(input)).toBe(true);
      expect(verifyConsistency({ ...input, secondRoot: corrupted(input.secondRoot) })).toBe(false);
      expect(verifyConsistency({ ...input, proof: [at(0)] })).toBe(false);
    },
  );

  it("rejects zero-sized trees including two empty trees", () => {
    expect(() => createConsistencyProof([], 0)).toThrow(RangeError);
    expect(() => createConsistencyProof(leafHashes, 0)).toThrow(RangeError);
    for (const [firstSize, secondSize] of [
      [0, 0],
      [0, 1],
      [1, 0],
    ] as const) {
      expect(
        verifyConsistency({
          firstSize,
          secondSize,
          firstRoot: expectedRoot(0),
          secondRoot: expectedRoot(secondSize),
          proof: [],
        }),
      ).toBe(false);
    }
  });

  it("rejects reversed, fractional, non-finite and unsafe sizes", () => {
    const input: ConsistencyInput = {
      firstSize: 1,
      secondSize: 2,
      firstRoot: expectedRoot(1),
      secondRoot: expectedRoot(2),
      proof: [at(1)],
    };
    for (const size of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(verifyConsistency({ ...input, firstSize: size })).toBe(false);
      expect(verifyConsistency({ ...input, secondSize: size })).toBe(false);
      expect(() => createConsistencyProof(leafHashes, size)).toThrow(RangeError);
    }
    expect(verifyConsistency({ ...input, firstSize: 2, secondSize: 1 })).toBe(false);
    expect(() => createConsistencyProof(leafHashes, 65)).toThrow(RangeError);
    expect(verifyConsistency(null as unknown as ConsistencyInput)).toBe(false);
  });

  it("rejects malformed hashes and paths, even for equal-size trees", () => {
    const input: ConsistencyInput = {
      firstSize: 1,
      secondSize: 2,
      firstRoot: expectedRoot(1),
      secondRoot: expectedRoot(2),
      proof: [at(1)],
    };
    for (const length of [0, 31, 33]) {
      const bad = new Uint8Array(length);
      expect(verifyConsistency({ ...input, firstRoot: bad })).toBe(false);
      expect(verifyConsistency({ ...input, secondRoot: bad })).toBe(false);
      expect(verifyConsistency({ ...input, proof: [bad] })).toBe(false);
      expect(
        verifyConsistency({ ...input, firstSize: 2, firstRoot: bad, secondRoot: bad, proof: [] }),
      ).toBe(false);
      expect(() => createConsistencyProof([bad], 1)).toThrow(TypeError);
    }
    expect(verifyConsistency({ ...input, proof: [] })).toBe(false);
    expect(verifyConsistency({ ...input, proof: new Array<Uint8Array>(1) })).toBe(false);
    expect(verifyConsistency({ ...input, proof: "proof" as unknown as Uint8Array[] })).toBe(false);
    expect(
      verifyConsistency({
        ...input,
        secondSize: Number.MAX_SAFE_INTEGER,
        proof: Array.from({ length: 55 }, () => at(0)),
      }),
    ).toBe(false);
    expect(() => createConsistencyProof(new Array<Uint8Array>(2), 1)).toThrow(TypeError);
  });

  it("does not mutate or alias caller-owned hashes, roots or proof arrays", () => {
    const hashes = leafHashes.slice(0, 7).map((hash) => new Uint8Array(hash));
    const before = hashes.map(bytesToHex);
    const proof = createConsistencyProof(Object.freeze(hashes), 3);
    const proofBefore = proof.map(bytesToHex);
    const firstRoot = new Uint8Array(expectedRoot(3));
    const secondRoot = new Uint8Array(expectedRoot(7));
    const frozenProof = Object.freeze(proof);
    expect(
      verifyConsistency({ firstSize: 3, secondSize: 7, firstRoot, secondRoot, proof: frozenProof }),
    ).toBe(true);
    expect(proof.map(bytesToHex)).toEqual(proofBefore);
    expect(firstRoot).toEqual(expectedRoot(3));
    expect(secondRoot).toEqual(expectedRoot(7));
    for (const hash of proof) hash[0] = (hash[0] ?? 0) ^ 1;
    expect(hashes.map(bytesToHex)).toEqual(before);
    const signingInput: BufferSource | undefined = proof[0];
    expect(signingInput).toBeInstanceOf(Uint8Array);
  });

  it.each([32, 52])("verifies a power-of-two %s-bit tree extended by one leaf", (bits) => {
    const firstSize = 2 ** bits;
    const firstRoot = at(0);
    const added = at(1);
    const input: ConsistencyInput = {
      firstSize,
      secondSize: firstSize + 1,
      firstRoot,
      secondRoot: nodeHash(firstRoot, added),
      proof: [added],
    };
    expect(verifyConsistency(input)).toBe(true);
    expect(verifyConsistency({ ...input, proof: [] })).toBe(false);
  });

  it.each([32, 52])("verifies a non-power-of-two prefix reaching a %s-bit full tree", (bits) => {
    const leftSiblings = Array.from({ length: bits - 1 }, (_, index) => at(index + 2));
    const firstRoot = leftSiblings.reduce((root, sibling) => nodeHash(sibling, root), at(0));
    const secondRoot = leftSiblings.reduce(
      (root, sibling) => nodeHash(sibling, root),
      nodeHash(at(0), at(1)),
    );
    const input: ConsistencyInput = {
      firstSize: 2 ** bits - 1,
      secondSize: 2 ** bits,
      firstRoot,
      secondRoot,
      proof: [at(0), at(1), ...leftSiblings],
    };
    expect(verifyConsistency(input)).toBe(true);
    expect(verifyConsistency({ ...input, proof: input.proof.slice(0, -1) })).toBe(false);
  });
});
