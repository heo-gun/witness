import { leafHash, rootFromLeafHashes, verifyInclusion } from "@tlog/merkle";
import {
  API_PREFIX,
  bytesToHex,
  canonicalBytes,
  canonicalize,
  hexToBytes,
  isLowercaseHex,
  type IssuePayload,
  type KeyRegisterEntry,
  type LogEntryData,
  type RevokePayload,
  type SignaturePayload,
  type SthPayload,
} from "@tlog/shared";
import type { PublicDocument } from "@/api/documents";

type Head = SthPayload & { signature: string };
interface Evidence<P extends SignaturePayload> {
  payload: P;
  signature: string;
  leafIndex: number;
  entryJson: string;
  auditPath: string[];
}
export interface VerifiedPublicDocument {
  document: PublicDocument;
  issue: Evidence<IssuePayload>;
  revocation: Evidence<RevokePayload> | null;
}
export interface VerifiedPublicDocuments {
  head: Head;
  documents: VerifiedPublicDocument[];
}

interface EntryRow {
  leafIndex: number;
  leafHash: string;
  entryJson: string;
  type: string;
  documentId: string | null;
}

export class MissingTreeHeadError extends Error {
  constructor() {
    super("The log has no signed tree head yet");
  }
}

function requireEvidence(condition: unknown): asserts condition {
  if (!condition) throw new Error("Document verification failed");
}

async function readLog<T>(path: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(`${API_PREFIX}/log/${path}`, {
    cache: "no-store",
    credentials: "omit",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (path === "sth" && response.status === 204) throw new MissingTreeHeadError();
  requireEvidence(response.ok && response.status !== 204);
  return (await response.json()) as T;
}

async function verifySignature(publicKey: string, payload: unknown, signature: string) {
  const key = await crypto.subtle.importKey("raw", hexToBytes(publicKey, 32), "Ed25519", false, [
    "verify",
  ]);
  requireEvidence(
    await crypto.subtle.verify("Ed25519", key, hexToBytes(signature, 64), canonicalBytes(payload)),
  );
}

function utcTimestamp(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 19) === value.slice(0, 19)
  );
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function keyScope(entry: KeyRegisterEntry) {
  return JSON.stringify([entry.orgId, entry.userId, entry.purpose]);
}

async function readHead(signal?: AbortSignal) {
  const pin = process.env.NEXT_PUBLIC_LOG_PUBLIC_KEY;
  requireEvidence(isLowercaseHex(pin, 32));
  const head = await readLog<Head>("sth", signal);
  const { treeSize, timestamp, rootHash, signature } = head;
  requireEvidence(
    Number.isSafeInteger(treeSize) &&
      treeSize > 0 &&
      utcTimestamp(timestamp) &&
      isLowercaseHex(rootHash, 32),
  );
  await verifySignature(pin, { treeSize, timestamp, rootHash }, signature);
  return head;
}

function parseEntry(row: EntryRow) {
  const entry = JSON.parse(row.entryJson) as LogEntryData;
  requireEvidence(canonicalize(entry) === row.entryJson);
  if ("type" in entry) {
    requireEvidence(
      !("payload" in entry) &&
        row.documentId === null &&
        row.type === entry.type &&
        (entry.type === "KEY_REGISTER" || entry.type === "KEY_REVOKE") &&
        hasText(entry.orgId) &&
        isLowercaseHex(entry.fingerprint, 32),
    );
    if (entry.type === "KEY_REGISTER") {
      requireEvidence(
        hasText(entry.userId) &&
          hasText(entry.approvedBy) &&
          utcTimestamp(entry.approvedAt) &&
          (entry.purpose === "sign" || entry.purpose === "encrypt") &&
          isLowercaseHex(entry.publicKey, 32),
      );
    } else {
      requireEvidence(
        hasText(entry.revokedBy) && utcTimestamp(entry.revokedAt) && hasText(entry.reason),
      );
    }
  } else {
    const { payload } = entry;
    requireEvidence(
      row.type === payload.action &&
        row.documentId === payload.documentId &&
        hasText(payload.documentId) &&
        hasText(payload.signerId) &&
        hasText(payload.orgId) &&
        (payload.action === "ISSUE" || payload.action === "REVOKE") &&
        isLowercaseHex(entry.signature, 64),
    );
    if (payload.action === "ISSUE") {
      requireEvidence(
        isLowercaseHex(payload.fileHash, 32) &&
          hasText(payload.title) &&
          ["budget", "settlement", "receipt", "agenda", "other"].includes(payload.category),
      );
    }
  }
  return entry;
}

async function checkSigner(
  keys: Map<string, KeyRegisterEntry | null>,
  payload: SignaturePayload,
  signature: string,
) {
  const key = keys.get(payload.signerKeyFingerprint);
  requireEvidence(
    key &&
      key.purpose === "sign" &&
      key.userId === payload.signerId &&
      key.orgId === payload.orgId &&
      utcTimestamp(payload.signedAt),
  );
  const digest = await crypto.subtle.digest("SHA-256", hexToBytes(key.publicKey, 32));
  requireEvidence(bytesToHex(new Uint8Array(digest)) === payload.signerKeyFingerprint);
  await verifySignature(key.publicKey, payload, signature);
}

async function inclusion(leafIndex: number, hash: Uint8Array, head: Head, signal?: AbortSignal) {
  const proof = await readLog<{ leafIndex: number; treeSize: number; auditPath: string[] }>(
    `proof/inclusion?leafIndex=${leafIndex}&treeSize=${head.treeSize}`,
    signal,
  );
  requireEvidence(
    proof.leafIndex === leafIndex &&
      proof.treeSize === head.treeSize &&
      Array.isArray(proof.auditPath) &&
      proof.auditPath.length <= 53 &&
      verifyInclusion({
        leafHash: hash,
        leafIndex,
        treeSize: head.treeSize,
        rootHash: hexToBytes(head.rootHash, 32),
        proof: proof.auditPath.map((item) => hexToBytes(item, 32)),
      }),
  );
  return proof.auditPath;
}

export async function verifyPublicDocuments(
  hash: string,
  candidates: readonly PublicDocument[],
  signal?: AbortSignal,
): Promise<VerifiedPublicDocuments> {
  requireEvidence(isLowercaseHex(hash, 32) && Array.isArray(candidates));
  const byId = new Map<string, PublicDocument>(
    candidates.map((document) => [document.id, document]),
  );
  requireEvidence(byId.size === candidates.length);
  const head = await readHead(signal);
  const hashes: Uint8Array[] = [];
  const keys = new Map<string, KeyRegisterEntry | null>();
  const activeScopes = new Set<string>();
  const issueIndices = new Map<string, number>();
  const matches = new Map<string, VerifiedPublicDocument>();
  const matchedOrgs = new Set<string>();

  // An inclusion proof alone cannot show that a later REVOKE or KEY_REVOKE was not withheld.
  for (let start = 0; start < head.treeSize; start += 100) {
    const end = Math.min(start + 99, head.treeSize - 1);
    const rows = await readLog<EntryRow[]>(`entries?start=${start}&end=${end}`, signal);
    requireEvidence(Array.isArray(rows) && rows.length === end - start + 1);
    for (const row of rows) {
      requireEvidence(row.leafIndex === hashes.length && typeof row.entryJson === "string");
      const digest = leafHash(new TextEncoder().encode(row.entryJson));
      requireEvidence(bytesToHex(digest) === row.leafHash);
      hashes.push(digest);
      const entry = parseEntry(row);
      if ("type" in entry) {
        const previous = keys.get(entry.fingerprint);
        if (entry.type === "KEY_REGISTER") {
          const scope = keyScope(entry);
          requireEvidence(previous === undefined && !activeScopes.has(scope));
          activeScopes.add(scope);
          keys.set(entry.fingerprint, entry);
        } else {
          // A pending key can be revoked without ever having a KEY_REGISTER record.
          requireEvidence(previous !== null && (!previous || previous.orgId === entry.orgId));
          if (previous) activeScopes.delete(keyScope(previous));
          keys.set(entry.fingerprint, null);
        }
        continue;
      }
      const { payload, signature } = entry;
      const { leafIndex, entryJson } = row;
      const document = byId.get(payload.documentId);
      if (payload.action === "ISSUE") {
        requireEvidence(!issueIndices.has(payload.documentId));
        issueIndices.set(payload.documentId, leafIndex);
        if (payload.fileHash !== hash) {
          requireEvidence(!document);
          continue;
        }
        requireEvidence(
          document &&
            !matchedOrgs.has(payload.orgId) &&
            document.fileHash === hash &&
            document.org.id === payload.orgId &&
            hasText(document.org.name) &&
            hasText(document.org.slug) &&
            document.title === payload.title &&
            document.category === payload.category &&
            document.issue.signer.id === payload.signerId &&
            hasText(document.issue.signer.name) &&
            document.issue.leafIndex === leafIndex,
        );
        await checkSigner(keys, payload, signature);
        matchedOrgs.add(payload.orgId);
        matches.set(payload.documentId, {
          document,
          issue: { payload, signature, leafIndex, entryJson, auditPath: [] },
          revocation: null,
        });
      } else {
        requireEvidence(
          issueIndices.has(payload.documentId) &&
            issueIndices.get(payload.documentId) === payload.targetLeafIndex,
        );
        const match = matches.get(payload.documentId);
        if (!match) continue;
        const revocation = match.document.revocation;
        requireEvidence(
          !match.revocation &&
            revocation &&
            revocation.leafIndex === leafIndex &&
            revocation.signer.id === payload.signerId &&
            hasText(revocation.signer.name) &&
            payload.orgId === match.issue.payload.orgId &&
            hasText(payload.reason),
        );
        await checkSigner(keys, payload, signature);
        match.revocation = { payload, signature, leafIndex, entryJson, auditPath: [] };
      }
    }
  }
  requireEvidence(
    bytesToHex(rootFromLeafHashes(hashes)) === head.rootHash && matches.size === byId.size,
  );
  const documents = Array.from(matches.values());
  for (const { document, issue, revocation } of documents) {
    requireEvidence(
      document.status === (revocation ? "revoked" : "valid") &&
        (document.revocation === null) === (revocation === null),
    );
    for (const event of revocation ? [issue, revocation] : [issue]) {
      event.auditPath = await inclusion(event.leafIndex, hashes[event.leafIndex]!, head, signal);
    }
  }
  return { head, documents };
}
