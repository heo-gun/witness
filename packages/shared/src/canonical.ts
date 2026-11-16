function serializeString(value: string): string {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        throw new TypeError("Unpaired surrogate in JSON string");
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError("Unpaired surrogate in JSON string");
    }
  }
  return JSON.stringify(value);
}

function readDataProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
    throw new TypeError("Canonical JSON requires enumerable data properties");
  }
  return descriptor.value;
}

// RFC 8785 §§3.1–3.2.3. Accept JSON data, without implicit toJSON conversions.
export function canonicalize(value: unknown): string {
  const ancestors = new Set<object>();
  function serialize(current: unknown): string {
    if (current === null) return "null";
    if (typeof current === "string") return serializeString(current);
    if (typeof current === "boolean") return current ? "true" : "false";
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw new TypeError("JSON numbers must be finite");
      return JSON.stringify(current);
    }
    if (typeof current !== "object") throw new TypeError("Unsupported JSON value");
    if (ancestors.has(current)) throw new TypeError("Cyclic JSON value");
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        const array: readonly unknown[] = current;
        if (Reflect.ownKeys(array).length !== array.length + 1) {
          throw new TypeError("JSON arrays must be dense and have no extra properties");
        }
        const items: string[] = [];
        for (let i = 0; i < array.length; i++)
          items.push(serialize(readDataProperty(array, String(i))));
        return `[${items.join(",")}]`;
      }
      const prototype: unknown = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("Canonical JSON requires plain objects");
      }
      if (Object.getOwnPropertySymbols(current).length > 0)
        throw new TypeError("JSON keys must be strings");
      // Emit each property directly: JSON.stringify(object) would reorder integer-like keys.
      const properties = Object.getOwnPropertyNames(current)
        .sort()
        .map((key) => `${serializeString(key)}:${serialize(readDataProperty(current, key))}`);
      return `{${properties.join(",")}}`;
    } finally {
      ancestors.delete(current);
    }
  }
  return serialize(value);
}

// RFC 8785 §3.2.4. Shared by browser signing and server verification.
export function canonicalBytes(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(canonicalize(value));
}
