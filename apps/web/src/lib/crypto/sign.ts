import { bytesToHex, canonicalBytes, type IssuePayload } from "@tlog/shared";

export async function signIssue(payload: IssuePayload, privateKey: CryptoKey) {
  const signature = await crypto.subtle.sign("Ed25519", privateKey, canonicalBytes(payload));
  return bytesToHex(new Uint8Array(signature));
}
