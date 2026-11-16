import { describe, expect, it } from "vitest";
import { canonicalBytes, canonicalize } from "../src/index.js";

describe("RFC 8785 canonical JSON", () => {
  it("sorts nested keys while preserving array order and input data", () => {
    const input = Object.freeze({ z: Object.freeze([{ b: 2, a: 1 }, false, null]), a: "한글" });
    expect(canonicalize(input)).toBe('{"a":"한글","z":[{"a":1,"b":2},false,null]}');
    expect(Object.keys(input)).toEqual(["z", "a"]);
    expect(canonicalize({ a: "한글", z: [{ a: 1, b: 2 }, false, null] })).toBe(canonicalize(input));
  });

  it("sorts integer-like names lexically instead of JavaScript object enumeration order", () => {
    expect(canonicalize({ 2: "two", 10: "ten", "": "empty" })).toBe(
      '{"":"empty","10":"ten","2":"two"}',
    );
  });

  it("uses raw UTF-16 key ordering from RFC 8785 §3.2.3", () => {
    const input = { "\u20ac": 5, "\r": 1, "\ufb33": 7, "1": 2, "😀": 6, "\u0080": 3, ö: 4 };
    expect(canonicalize(input)).toBe('{"\\r":1,"1":2,"\u0080":3,"ö":4,"€":5,"😀":6,"דּ":7}');
  });

  it("escapes control characters and quotes without Unicode normalization", () => {
    expect(canonicalize('\u0000\b\t\n\f\r"\\/')).toBe(String.raw`"\u0000\b\t\n\f\r\"\\/"`);
    expect(canonicalize("é")).not.toBe(canonicalize("e\u0301"));
    expect(canonicalize("😀")).toBe('"😀"');
  });

  // IEEE 754 bit patterns and expected decimal strings: RFC 8785 Appendix B.
  it.each([
    ["0000000000000000", "0"],
    ["8000000000000000", "0"],
    ["0000000000000001", "5e-324"],
    ["8000000000000001", "-5e-324"],
    ["7fefffffffffffff", "1.7976931348623157e+308"],
    ["ffefffffffffffff", "-1.7976931348623157e+308"],
    ["4340000000000000", "9007199254740992"],
    ["c340000000000000", "-9007199254740992"],
    ["4430000000000000", "295147905179352830000"],
    ["44b52d02c7e14af5", "9.999999999999997e+22"],
    ["44b52d02c7e14af6", "1e+23"],
    ["44b52d02c7e14af7", "1.0000000000000001e+23"],
    ["444b1ae4d6e2ef4e", "999999999999999700000"],
    ["444b1ae4d6e2ef4f", "999999999999999900000"],
    ["444b1ae4d6e2ef50", "1e+21"],
    ["3eb0c6f7a0b5ed8c", "9.999999999999997e-7"],
    ["3eb0c6f7a0b5ed8d", "0.000001"],
    ["41b3de4355555553", "333333333.3333332"],
    ["41b3de4355555554", "333333333.33333325"],
    ["41b3de4355555555", "333333333.3333333"],
    ["41b3de4355555556", "333333333.3333334"],
    ["41b3de4355555557", "333333333.33333343"],
    ["becbf647612f3696", "-0.0000033333333333333333"],
    ["43143ff3c1cb0959", "1424953923781206.2"],
  ])("serializes number bits %s as %s", (bits, expected) => {
    const view = new DataView(new ArrayBuffer(8));
    view.setBigUint64(0, BigInt(`0x${bits}`));
    expect(canonicalize(view.getFloat64(0))).toBe(expected);
  });

  it("emits exact UTF-8 bytes without BOM or trailing whitespace", () => {
    const signingInput: BufferSource = canonicalBytes({ a: "가" });
    expect(signingInput).toBeInstanceOf(Uint8Array);
    expect(Array.from(canonicalBytes({ a: "가" }))).toEqual([
      0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xea, 0xb0, 0x80, 0x22, 0x7d,
    ]);
    expect(Array.from(canonicalBytes("😀"))).toEqual([0x22, 0xf0, 0x9f, 0x98, 0x80, 0x22]);
  });

  it.each([undefined, NaN, Infinity, -Infinity, 1n, Symbol("x"), () => 1])(
    "rejects a non-JSON value at any depth (%#)",
    (value) => {
      for (const input of [value, { nested: value }, [value]])
        expect(() => canonicalize(input)).toThrow(TypeError);
    },
  );

  it.each(["\ud800", "\udfff", "\ud800x", "x\udfff", "\ud800\ud800"])(
    "rejects unpaired surrogates in keys and values (%#)",
    (value) => {
      expect(() => canonicalize(value)).toThrow(TypeError);
      expect(() => canonicalBytes({ [value]: "value" })).toThrow(TypeError);
    },
  );

  it("rejects cycles while permitting repeated references to non-cyclic objects", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const array: unknown[] = [];
    array.push(array);
    expect(() => canonicalize(circular)).toThrow(TypeError);
    expect(() => canonicalize(array)).toThrow(TypeError);
    const shared = { x: 1 };
    expect(canonicalize([shared, shared])).toBe('[{"x":1},{"x":1}]');
  });

  it("rejects implicit conversions, accessors, symbol and hidden properties", () => {
    let called = false;
    const getter = Object.defineProperty({}, "x", {
      enumerable: true,
      get: () => {
        called = true;
        return 1;
      },
    });
    const toJSON = {
      toJSON: () => {
        called = true;
        return "changed";
      },
    };
    for (const input of [
      new Date(),
      new Map(),
      new Set(),
      new Uint8Array([1]),
      toJSON,
      getter,
      { [Symbol("x")]: 1 },
      Object.defineProperty({}, "hidden", { value: 1 }),
    ]) {
      expect(() => canonicalize(input)).toThrow(TypeError);
    }
    expect(called).toBe(false);
  });

  it("rejects holes, extra array properties and array accessors", () => {
    const accessor = Object.defineProperty([1], "0", { get: () => 2 });
    for (const input of [Array(2), Object.assign([1], { extra: 2 }), accessor]) {
      expect(() => canonicalize(input)).toThrow(TypeError);
    }
    expect(canonicalize([])).toBe("[]");
  });

  it("preserves __proto__ as data and supports null-prototype dictionaries", () => {
    expect(canonicalize(JSON.parse('{"__proto__":{"x":1},"a":2}'))).toBe(
      '{"__proto__":{"x":1},"a":2}',
    );
    const dictionary: unknown = Object.assign(Object.create(null), { b: 2, a: 1 });
    expect(canonicalize(dictionary)).toBe('{"a":1,"b":2}');
  });
});
