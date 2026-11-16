export type Category = "budget" | "settlement" | "receipt" | "agenda" | "other";
export type KeyPurpose = "sign" | "encrypt";

export interface IssuePayload {
  readonly action: "ISSUE";
  readonly orgId: string;
  readonly documentId: string;
  readonly fileHash: string;
  readonly title: string;
  readonly category: Category;
  readonly signerId: string;
  readonly signerKeyFingerprint: string;
  readonly signedAt: string;
}

export interface RevokePayload {
  readonly action: "REVOKE";
  readonly orgId: string;
  readonly documentId: string;
  readonly targetLeafIndex: number;
  readonly reason: string;
  readonly signerId: string;
  readonly signerKeyFingerprint: string;
  readonly signedAt: string;
}

export type SignaturePayload = IssuePayload | RevokePayload;

export interface SignedEntry {
  readonly payload: SignaturePayload;
  readonly signature: string;
}

export interface KeyRegisterEntry {
  readonly type: "KEY_REGISTER";
  readonly orgId: string;
  readonly userId: string;
  readonly purpose: KeyPurpose;
  readonly publicKey: string;
  readonly fingerprint: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
}

export interface KeyRevokeEntry {
  readonly type: "KEY_REVOKE";
  readonly orgId: string;
  readonly fingerprint: string;
  readonly revokedBy: string;
  readonly revokedAt: string;
  readonly reason: string;
}

export type LogEntryData = SignedEntry | KeyRegisterEntry | KeyRevokeEntry;

export interface SthPayload {
  readonly treeSize: number;
  readonly timestamp: string;
  readonly rootHash: string;
}
