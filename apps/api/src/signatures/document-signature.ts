import { createPublicKey, verify } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { canonicalBytes, hexToBytes, type SignaturePayload } from "@tlog/shared";

export function requireRecentSignature(signedAt: string, now: Date) {
  const signedTime = Date.parse(signedAt);
  if (!Number.isFinite(signedTime) || Math.abs(signedTime - now.getTime()) >= 5 * 60_000)
    throw new BadRequestException("Signing time is outside the allowed window");
}

export function verifyDocumentSignature(
  payload: SignaturePayload,
  signature: string,
  rawKey: string,
) {
  const publicKey = createPublicKey({
    format: "jwk",
    key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(rawKey, "hex").toString("base64url") },
  });
  if (!verify(null, canonicalBytes(payload), publicKey, hexToBytes(signature, 64)))
    throw new BadRequestException("Invalid document signature");
}
