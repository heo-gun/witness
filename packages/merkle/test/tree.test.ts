import { describe, expect, it } from "vitest";
import { bytesToHex } from "@tlog/shared";
import { leafHash, nodeHash, rootFromLeafHashes } from "../src/index.js";
import { entries, expectedRoot, roots } from "./fixtures.js";

const leafHashes = entries.map(leafHash);

describe("RFC 9162 §2.1.1 Merkle roots", () => {
  it("has independently generated fixtures for every tree size 0 through 64", () => {
    expect(entries).toHaveLength(64);
    expect(roots.map((vector) => vector.treeSize)).toEqual(Array.from({ length: 65 }, (_, n) => n));
  });

  it.each(roots)("matches the independent root for size $treeSize", ({ treeSize, rootHash }) => {
    expect(bytesToHex(rootFromLeafHashes(leafHashes.slice(0, treeSize)))).toBe(rootHash);
  });

  it("distinguishes an empty tree, an empty entry and an internal node", () => {
    expect(bytesToHex(rootFromLeafHashes([]))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(bytesToHex(leafHash(new Uint8Array()))).toBe(
      "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
    );
    const left = leafHash(new Uint8Array());
    const right = leafHash(new Uint8Array([1]));
    expect(nodeHash(left, right)).not.toEqual(leafHash(new Uint8Array([...left, ...right])));
    expect(nodeHash(left, leafHash(new TextEncoder().encode("tlog-vector-001")))).toEqual(
      expectedRoot(2),
    );
  });

  it("does not mutate or return an alias of input hashes", () => {
    const hash = leafHash(new Uint8Array());
    const before = new Uint8Array(hash);
    const root = rootFromLeafHashes(Object.freeze([hash]));
    root[0] = (root[0] ?? 0) ^ 0xff;
    expect(hash).toEqual(before);
    const left = new Uint8Array(hash);
    const right = new Uint8Array(hash);
    nodeHash(left, right);
    expect(left).toEqual(before);
    expect(right).toEqual(before);
  });

  it.each([0, 1, 31, 33, 64])("rejects %s-byte hashes", (length) => {
    const bad = new Uint8Array(length);
    const good = new Uint8Array(32);
    expect(() => rootFromLeafHashes([bad])).toThrow(TypeError);
    expect(() => nodeHash(bad, good)).toThrow(TypeError);
    expect(() => nodeHash(good, bad)).toThrow(TypeError);
  });

  it("rejects non-byte input and sparse leaf lists", () => {
    expect(() => leafHash("entry" as unknown as Uint8Array)).toThrow(TypeError);
    expect(() => rootFromLeafHashes(new Uint8Array(32) as unknown as Uint8Array[])).toThrow(
      TypeError,
    );
    expect(() => rootFromLeafHashes(new Array<Uint8Array>(2))).toThrow(TypeError);
  });

  it("returns owned bytes usable by WebCrypto", () => {
    const root: BufferSource = rootFromLeafHashes([]);
    const leaf: BufferSource = leafHash(new Uint8Array());
    expect(root).toBeInstanceOf(Uint8Array);
    expect(leaf).toBeInstanceOf(Uint8Array);
  });
});
