import { sha256 } from "@noble/hashes/sha2.js";

export function isHash(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array && value.length === 32;
}

export function assertHash(value: unknown): asserts value is Uint8Array {
  if (!isHash(value)) throw new TypeError("Merkle hashes must contain exactly 32 bytes");
}

// RFC 9162 §2.1.1: leaf and internal node prefixes separate their domains.
export function leafHash(entryBytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (!(entryBytes instanceof Uint8Array)) throw new TypeError("Entry must be a byte array");
  return sha256.create().update(Uint8Array.of(0x00)).update(entryBytes).digest();
}

export function nodeHash(left: Uint8Array, right: Uint8Array): Uint8Array<ArrayBuffer> {
  assertHash(left);
  assertHash(right);
  return sha256.create().update(Uint8Array.of(0x01)).update(left).update(right).digest();
}

export function emptyRoot(): Uint8Array<ArrayBuffer> {
  return sha256(new Uint8Array());
}
