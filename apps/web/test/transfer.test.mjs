import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import test from "node:test";
import { decryptFile, encryptFileFor, MAX_FILE_BYTES } from "../src/lib/crypto/transfer.ts";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function recipientKey() {
  const pair = generateKeyPairSync("x25519");
  const raw = Buffer.from(pair.publicKey.export({ format: "jwk" }).x, "base64url");
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pair.privateKey.export({ format: "der", type: "pkcs8" }),
    "X25519",
    false,
    ["deriveBits"],
  );
  return { pair, raw, publicKey: raw.toString("hex"), fingerprint: digest(raw), privateKey };
}

const recipient = await recipientKey();
const message = Buffer.from("Witness 결산서");
const file = new Blob([message]);
const context = {
  requestId: "request-1",
  orgId: "org-1",
  fileHash: digest(message),
  recipientFingerprint: recipient.fingerprint,
};
// Explicit JCS key order, independent of the browser implementation.
const additionalData = Buffer.from(JSON.stringify(context, Object.keys(context).sort()));
const encrypted = await encryptFileFor(file, recipient.publicKey, context);
const decrypt = (envelope = encrypted, binding = context, privateKey = recipient.privateKey) =>
  decryptFile(envelope, recipient.publicKey, privateKey, binding);

test("browser ciphertext opens with the independently specified X25519/HKDF/AES-GCM parameters", () => {
  const ephemeral = Buffer.from(encrypted.ephemeralPublicKey, "hex");
  const publicKey = createPublicKey({
    key: { kty: "OKP", crv: "X25519", x: ephemeral.toString("base64url") },
    format: "jwk",
  });
  const secret = diffieHellman({ publicKey, privateKey: recipient.pair.privateKey });
  const key = hkdfSync(
    "sha256",
    secret,
    Buffer.concat([ephemeral, recipient.raw]),
    "tlog/file/v1",
    32,
  );
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "hex"));
  const ciphertext = Buffer.from(encrypted.ciphertext);
  decipher.setAAD(additionalData);
  decipher.setAuthTag(ciphertext.subarray(-16));
  assert.deepEqual(
    Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]),
    message,
  );
});

test("decryption returns the locally computed hash and each delivery uses a fresh ephemeral key and IV", async () => {
  const second = await encryptFileFor(file, recipient.publicKey, context);
  assert.notEqual(second.ephemeralPublicKey, encrypted.ephemeralPublicKey);
  assert.notEqual(second.iv, encrypted.iv);
  assert.equal(recipient.privateKey.extractable, false);
  const result = await decrypt();
  assert.deepEqual(Buffer.from(result.plaintext), message);
  assert.equal(result.fileHash, digest(message));
});

test("decryption rejects changed ciphertext, IV, recipient, private key and each bound request field", async () => {
  const changed = encrypted.ciphertext.slice(0);
  new Uint8Array(changed)[0] ^= 1;
  await assert.rejects(decrypt({ ...encrypted, ciphertext: changed }));
  const iv = Buffer.from(encrypted.iv, "hex");
  iv[0] ^= 1;
  await assert.rejects(decrypt({ ...encrypted, iv: iv.toString("hex") }));
  const other = await recipientKey();
  await assert.rejects(decrypt(encrypted, context, other.privateKey));
  await assert.rejects(decrypt({ ...encrypted, recipientFingerprint: other.fingerprint }));
  for (const field of Object.keys(context)) {
    await assert.rejects(decrypt(encrypted, { ...context, [field]: context[field] + "x" }));
  }
});

test("an authentic envelope containing a different document cannot supply a signing hash", async () => {
  const ephemeral = generateKeyPairSync("x25519");
  const raw = Buffer.from(ephemeral.publicKey.export({ format: "jwk" }).x, "base64url");
  const secret = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: recipient.pair.publicKey,
  });
  const key = hkdfSync("sha256", secret, Buffer.concat([raw, recipient.raw]), "tlog/file/v1", 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(additionalData);
  const bytes = Buffer.concat([cipher.update("다른 문서"), cipher.final(), cipher.getAuthTag()]);
  await assert.rejects(
    decrypt({
      ciphertext: Uint8Array.from(bytes).buffer,
      iv: iv.toString("hex"),
      ephemeralPublicKey: raw.toString("hex"),
      recipientFingerprint: recipient.fingerprint,
    }),
    /Decrypted file hash mismatch/,
  );
});

test("invalid size, malformed header, wrong selected file and mismatched recipient key are rejected", async () => {
  await assert.rejects(
    encryptFileFor(new Blob([new Uint8Array(MAX_FILE_BYTES + 1)]), recipient.publicKey, context),
    RangeError,
  );
  for (const size of [15, MAX_FILE_BYTES + 17]) {
    await assert.rejects(decrypt({ ...encrypted, ciphertext: new ArrayBuffer(size) }), RangeError);
  }
  await assert.rejects(decrypt({ ...encrypted, ephemeralPublicKey: "ff".repeat(31) }), TypeError);
  await assert.rejects(decrypt({ ...encrypted, iv: "FF".repeat(12) }), TypeError);
  await assert.rejects(
    encryptFileFor(new Blob(["different"]), recipient.publicKey, context),
    /Source file hash/,
  );
  await assert.rejects(
    encryptFileFor(file, (await recipientKey()).publicKey, context),
    /fingerprint/,
  );
});
