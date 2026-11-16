export function isLowercaseHex(value: unknown, byteLength?: number): value is string {
  if (byteLength !== undefined && (!Number.isSafeInteger(byteLength) || byteLength < 0))
    return false;
  return (
    typeof value === "string" &&
    value.length % 2 === 0 &&
    (byteLength === undefined || value.length / 2 === byteLength) &&
    !/[^0-9a-f]/.test(value)
  );
}

export function hexToBytes(value: unknown, byteLength?: number): Uint8Array<ArrayBuffer> {
  if (!isLowercaseHex(value, byteLength))
    throw new TypeError("Expected lowercase hex with the required byte length");
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
