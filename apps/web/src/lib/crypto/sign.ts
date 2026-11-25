import { bytesToHex, canonicalBytes, type SignaturePayload } from "@tlog/shared";

export async function signPayload(payload: SignaturePayload, privateKey: CryptoKey) {
  const signature = await crypto.subtle.sign("Ed25519", privateKey, canonicalBytes(payload));
  return bytesToHex(new Uint8Array(signature));
}
