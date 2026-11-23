import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { canonicalBytes, type SthPayload } from "@tlog/shared";

function readSigningKey(): KeyObject {
  const encoded = process.env.LOG_SIGNING_KEY;
  if (!encoded) throw new ServiceUnavailableException("Log signing is not configured");

  const der = Buffer.from(encoded, "base64");
  const invalidKey = new ServiceUnavailableException("Invalid log signing key");
  if (der.toString("base64") !== encoded) throw invalidKey;
  let key: KeyObject;
  try {
    key = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  } catch {
    throw invalidKey;
  }
  if (key.asymmetricKeyType !== "ed25519") throw invalidKey;
  return key;
}

@Injectable()
export class SthSignerService {
  private key?: KeyObject;

  sign({ treeSize, timestamp, rootHash }: SthPayload): string {
    this.key ??= readSigningKey();
    return sign(null, canonicalBytes({ treeSize, timestamp, rootHash }), this.key).toString("hex");
  }
}
