import { bytesToHex, canonicalBytes, hexToBytes } from "@tlog/shared";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const TAG_BYTES = 16;

export interface TransferContext {
  requestId: string;
  orgId: string;
  fileHash: string;
  recipientFingerprint: string;
}

export interface EncryptedTransfer {
  ciphertext: ArrayBuffer;
  ephemeralPublicKey: string;
  iv: string;
  recipientFingerprint: string;
}

function aad({ requestId, orgId, fileHash, recipientFingerprint }: TransferContext) {
  return canonicalBytes({ requestId, orgId, fileHash, recipientFingerprint });
}

async function sha256(bytes: BufferSource) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function recipientBytes(publicKey: string, fingerprint: string) {
  const raw = hexToBytes(publicKey, 32);
  if ((await sha256(raw)) !== fingerprint) throw new Error("Recipient key fingerprint mismatch");
  return raw;
}

async function deriveFileKey(
  privateKey: CryptoKey,
  ephemeral: Uint8Array<ArrayBuffer>,
  recipient: Uint8Array<ArrayBuffer>,
  usage: "encrypt" | "decrypt",
) {
  const peer = await crypto.subtle.importKey(
    "raw",
    usage === "encrypt" ? recipient : ephemeral,
    "X25519",
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "X25519", public: peer }, privateKey, 256),
  );
  const material = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  shared.fill(0);
  const salt = new Uint8Array(64);
  salt.set(ephemeral);
  salt.set(recipient, 32);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("tlog/file/v1") },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

export async function encryptFileFor(
  file: Blob,
  recipientPublicKey: string,
  context: TransferContext,
): Promise<EncryptedTransfer> {
  if (file.size > MAX_FILE_BYTES) throw new RangeError("File exceeds 20 MiB");
  const recipient = await recipientBytes(recipientPublicKey, context.recipientFingerprint);
  const plaintext = await file.arrayBuffer();
  if ((await sha256(plaintext)) !== context.fileHash) throw new Error("Source file hash mismatch");
  const pair = await crypto.subtle.generateKey("X25519", false, ["deriveBits"]);
  const ephemeral = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const key = await deriveFileKey(pair.privateKey, ephemeral, recipient, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(context), tagLength: TAG_BYTES * 8 },
    key,
    plaintext,
  );
  return {
    ciphertext,
    ephemeralPublicKey: bytesToHex(ephemeral),
    iv: bytesToHex(iv),
    recipientFingerprint: context.recipientFingerprint,
  };
}

export async function decryptFile(
  encrypted: EncryptedTransfer,
  recipientPublicKey: string,
  privateKey: CryptoKey,
  context: TransferContext,
): Promise<{ plaintext: ArrayBuffer; fileHash: string }> {
  const size = encrypted.ciphertext.byteLength;
  if (size < TAG_BYTES || size > MAX_FILE_BYTES + TAG_BYTES)
    throw new RangeError("Invalid ciphertext size");
  if (encrypted.recipientFingerprint !== context.recipientFingerprint)
    throw new Error("Recipient key fingerprint mismatch");
  const recipient = await recipientBytes(recipientPublicKey, context.recipientFingerprint);
  const ephemeral = hexToBytes(encrypted.ephemeralPublicKey, 32);
  const iv = hexToBytes(encrypted.iv, 12);
  const key = await deriveFileKey(privateKey, ephemeral, recipient, "decrypt");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aad(context), tagLength: TAG_BYTES * 8 },
    key,
    encrypted.ciphertext,
  );
  const fileHash = await sha256(plaintext);
  if (fileHash !== context.fileHash) throw new Error("Decrypted file hash mismatch");
  return { plaintext, fileHash };
}
