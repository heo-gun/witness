export function previewType(bytes: Uint8Array): string | undefined {
  const prefix = bytes.subarray(0, 12);
  const start = new TextDecoder("latin1").decode(prefix);
  if (start.startsWith("%PDF-")) return "application/pdf";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => prefix[i] === v)) return "image/png";
  if (prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255) return "image/jpeg";
  if (start.startsWith("RIFF") && start.slice(8) === "WEBP") return "image/webp";
}
