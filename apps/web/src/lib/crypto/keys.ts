import { bytesToHex, type KeyPurpose } from "@tlog/shared";

export type { KeyPurpose } from "@tlog/shared";

export interface KeyScope {
  userId: string;
  orgId: string;
}

export interface LocalPublicKey {
  purpose: KeyPurpose;
  publicKey: string;
  fingerprint: string;
}

interface StoredKey extends KeyScope, LocalPublicKey {
  privateKey: CryptoKey;
}

function publicPart({ purpose, publicKey, fingerprint }: StoredKey): LocalPublicKey {
  return { purpose, publicKey, fingerprint };
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withKeys<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const open = indexedDB.open("witness-member-keys", 1);
  open.onupgradeneeded = () => {
    const keys = open.result.createObjectStore("keys", {
      keyPath: ["userId", "orgId", "purpose", "fingerprint"],
    });
    keys.createIndex("member", ["userId", "orgId"]);
  };
  const db = await result(open);
  try {
    const tx = db.transaction("keys", mode, { durability: "strict" });
    const committed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("Key storage transaction aborted"));
    });
    const [value] = await Promise.all([operation(tx.objectStore("keys")), committed]);
    return value;
  } finally {
    db.close();
  }
}

function memberKeys(store: IDBObjectStore, scope: KeyScope): Promise<StoredKey[]> {
  return result(store.index("member").getAll([scope.userId, scope.orgId]));
}

export function listLocalKeys(scope: KeyScope): Promise<LocalPublicKey[]> {
  return withKeys("readonly", async (store) => (await memberKeys(store, scope)).map(publicPart));
}

export async function generateMemberKeys(
  scope: KeyScope,
  purpose: KeyPurpose,
  registeredFingerprints: readonly string[],
): Promise<LocalPublicKey> {
  const pending = (key: LocalPublicKey) =>
    key.purpose === purpose && !registeredFingerprints.includes(key.fingerprint);
  const retry = (await listLocalKeys(scope)).find(pending);
  if (retry) return retry;

  const pair =
    purpose === "sign"
      ? await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"])
      : await crypto.subtle.generateKey("X25519", false, ["deriveBits"]);
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  const key: StoredKey = {
    userId: scope.userId,
    orgId: scope.orgId,
    purpose,
    publicKey: bytesToHex(new Uint8Array(raw)),
    fingerprint: bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", raw))),
    privateKey: pair.privateKey,
  };
  return withKeys("readwrite", async (store) => {
    // Another tab may have prepared a key while WebCrypto was generating this pair.
    const existing = (await memberKeys(store, scope)).find(pending);
    if (existing) return publicPart(existing);
    await result(store.add(key));
    return publicPart(key);
  });
}

export function getPrivateKey(
  scope: KeyScope,
  purpose: KeyPurpose,
  fingerprint: string,
): Promise<CryptoKey | undefined> {
  return withKeys("readonly", async (store) => {
    const key: StoredKey | undefined = await result(
      store.get([scope.userId, scope.orgId, purpose, fingerprint]),
    );
    return key?.privateKey;
  });
}
