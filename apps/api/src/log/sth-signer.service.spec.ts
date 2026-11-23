import { generateKeyPairSync, verify } from "node:crypto";
import { canonicalBytes, type SthPayload } from "@tlog/shared";
import { SthSignerService } from "./sth-signer.service.js";

describe("STH signing", () => {
  const originalKey = process.env.LOG_SIGNING_KEY;
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const encoded = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  const payload: SthPayload = {
    treeSize: 1,
    timestamp: "2026-11-23T00:00:00.000Z",
    rootHash: "ab".repeat(32),
  };

  afterEach(() => {
    if (originalKey === undefined) delete process.env.LOG_SIGNING_KEY;
    else process.env.LOG_SIGNING_KEY = originalKey;
  });

  it("signs only the canonical STH fields with the configured Ed25519 key", () => {
    process.env.LOG_SIGNING_KEY = encoded;
    const withMetadata = { ...payload, extra: "outside the signed payload" };
    const hex = new SthSignerService().sign(withMetadata);
    expect(hex).toMatch(/^[0-9a-f]{128}$/);
    const signature = Buffer.from(hex, "hex");
    expect(verify(null, canonicalBytes(payload), publicKey, signature)).toBe(true);
    for (const changed of [
      { ...payload, treeSize: 2 },
      { ...payload, timestamp: "2026-11-23T00:00:01.000Z" },
      { ...payload, rootHash: "cd".repeat(32) },
    ]) {
      expect(verify(null, canonicalBytes(changed), publicKey, signature)).toBe(false);
    }
    const otherKey = generateKeyPairSync("ed25519").publicKey;
    expect(verify(null, canonicalBytes(payload), otherKey, signature)).toBe(false);
  });

  it("allows the API to start without a log key and refuses to sign until configured", () => {
    delete process.env.LOG_SIGNING_KEY;
    const signer = new SthSignerService();
    expect(() => signer.sign(payload)).toThrow("Log signing is not configured");
    process.env.LOG_SIGNING_KEY = encoded;
    expect(() => signer.sign(payload)).not.toThrow();
  });

  it("rejects malformed data and keys of the wrong type", () => {
    const x25519 = generateKeyPairSync("x25519").privateKey;
    for (const invalid of [
      encoded + "!",
      Buffer.from("invalid DER").toString("base64"),
      publicKey.export({ format: "der", type: "spki" }).toString("base64"),
      x25519.export({ format: "der", type: "pkcs8" }).toString("base64"),
    ]) {
      process.env.LOG_SIGNING_KEY = invalid;
      expect(() => new SthSignerService().sign(payload)).toThrow("Invalid log signing key");
    }
  });
});
