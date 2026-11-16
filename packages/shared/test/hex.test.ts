import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes, isLowercaseHex } from "../src/index.js";

describe("lowercase hex", () => {
  it("round-trips all byte values, retaining leading zeros", () => {
    const importInput: BufferSource = hexToBytes("00abff");
    expect(importInput).toBeInstanceOf(Uint8Array);
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    const hex = bytesToHex(bytes);
    expect(hex.startsWith("000102030405060708090a0b0c0d0e0f")).toBe(true);
    expect(hex.endsWith("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff")).toBe(true);
    expect(hexToBytes(hex, 256)).toEqual(bytes);
    expect(hexToBytes("00abff")).toEqual(new Uint8Array([0, 171, 255]));
  });

  it("checks byte lengths for hashes, public keys and signatures", () => {
    expect(isLowercaseHex("ab".repeat(32), 32)).toBe(true);
    expect(isLowercaseHex("ab".repeat(64), 64)).toBe(true);
    expect(isLowercaseHex("ab".repeat(31), 32)).toBe(false);
    expect(isLowercaseHex("ab".repeat(33), 32)).toBe(false);
    expect(() => hexToBytes("ab".repeat(32), 64)).toThrow(TypeError);
  });

  it.each([
    undefined,
    null,
    12,
    [],
    "0",
    "abc",
    "AB",
    "0x00",
    "gg",
    "a\n",
    "00\r\n",
    " 00 ",
    "００",
  ])("rejects malformed hex without trimming or lowercasing (%#)", (value) => {
    expect(isLowercaseHex(value)).toBe(false);
    expect(() => hexToBytes(value)).toThrow(TypeError);
  });

  it.each([-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid byte length %s",
    (size) => {
      expect(isLowercaseHex("00", size)).toBe(false);
      expect(() => hexToBytes("00", size)).toThrow(TypeError);
    },
  );

  it("allows empty generic bytes but rejects empty cryptographic fields with a required length", () => {
    expect(bytesToHex(new Uint8Array())).toBe("");
    expect(hexToBytes("", 0)).toEqual(new Uint8Array());
    expect(isLowercaseHex("")).toBe(true);
    expect(isLowercaseHex("", 32)).toBe(false);
  });
});
