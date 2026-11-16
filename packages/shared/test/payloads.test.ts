import { describe, expect, it } from "vitest";
import { canonicalize } from "../src/index.js";
import type {
  IssuePayload,
  KeyRegisterEntry,
  KeyRevokeEntry,
  LogEntryData,
  RevokePayload,
  SthPayload,
} from "../src/index.js";

describe("protocol payload encoding", () => {
  const fileHash = "ab".repeat(32);
  const fingerprint = "cd".repeat(32);
  const signature = "ef".repeat(64);
  const signedAt = "2026-11-16T00:00:00.000Z";

  it("encodes ISSUE as a self-contained payload and signature, without an outer type field", () => {
    const payload: IssuePayload = {
      action: "ISSUE",
      orgId: "org",
      documentId: "doc",
      fileHash,
      title: "결산서",
      category: "settlement",
      signerId: "signer",
      signerKeyFingerprint: fingerprint,
      signedAt,
    };
    const entry: LogEntryData = { signature, payload };
    expect(canonicalize(entry)).toBe(
      `{"payload":{"action":"ISSUE","category":"settlement","documentId":"doc","fileHash":"${fileHash}","orgId":"org","signedAt":"${signedAt}","signerId":"signer","signerKeyFingerprint":"${fingerprint}","title":"결산서"},"signature":"${signature}"}`,
    );
  });

  it("includes the target leaf and reason in REVOKE signatures", () => {
    const payload: RevokePayload = {
      action: "REVOKE",
      orgId: "org",
      documentId: "doc",
      targetLeafIndex: 0,
      reason: "정정",
      signerId: "signer",
      signerKeyFingerprint: fingerprint,
      signedAt,
    };
    expect(canonicalize({ payload, signature } satisfies LogEntryData)).toBe(
      `{"payload":{"action":"REVOKE","documentId":"doc","orgId":"org","reason":"정정","signedAt":"${signedAt}","signerId":"signer","signerKeyFingerprint":"${fingerprint}","targetLeafIndex":0},"signature":"${signature}"}`,
    );
  });

  it("encodes key approval and revocation as flat log entries", () => {
    const register: KeyRegisterEntry = {
      type: "KEY_REGISTER",
      orgId: "org",
      userId: "signer",
      purpose: "sign",
      publicKey: fileHash,
      fingerprint,
      approvedBy: "owner",
      approvedAt: signedAt,
    };
    const revoke: KeyRevokeEntry = {
      type: "KEY_REVOKE",
      orgId: "org",
      fingerprint,
      revokedBy: "owner",
      revokedAt: signedAt,
      reason: "기기 교체",
    };
    expect(canonicalize(register)).toBe(
      `{"approvedAt":"${signedAt}","approvedBy":"owner","fingerprint":"${fingerprint}","orgId":"org","publicKey":"${fileHash}","purpose":"sign","type":"KEY_REGISTER","userId":"signer"}`,
    );
    expect(canonicalize(revoke)).toBe(
      `{"fingerprint":"${fingerprint}","orgId":"org","reason":"기기 교체","revokedAt":"${signedAt}","revokedBy":"owner","type":"KEY_REVOKE"}`,
    );
  });

  it("keeps STH signing data separate from document signing data", () => {
    const payload: SthPayload = { treeSize: 1, timestamp: signedAt, rootHash: fileHash };
    expect(canonicalize(payload)).toBe(
      `{"rootHash":"${fileHash}","timestamp":"${signedAt}","treeSize":1}`,
    );
  });
});
