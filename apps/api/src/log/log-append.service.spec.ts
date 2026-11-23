import { canonicalBytes, type SignedEntry } from "@tlog/shared";
import { LogAppendService } from "./log-append.service.js";
import { SthSignerService } from "./sth-signer.service.js";

const base = {
  orgId: "organization",
  signerId: "signer",
  documentId: "document",
  signerKeyFingerprint: "ef".repeat(32),
  signedAt: "2026-11-23T00:00:00.000Z",
};
const entries: [SignedEntry, SignedEntry] = [
  {
    payload: {
      ...base,
      action: "ISSUE",
      title: "결산",
      category: "budget",
      fileHash: "ab".repeat(32),
    },
    signature: "01".repeat(64),
  },
  {
    payload: { ...base, action: "REVOKE", targetLeafIndex: 0, reason: "정정" },
    signature: "02".repeat(64),
  },
];

function setup(state: { treeSize: number }[], rows: { leafIndex: number; leafHash: string }[]) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValueOnce(state).mockResolvedValueOnce(rows),
    logEntry: { create: jest.fn() },
    treeHead: { create: jest.fn() },
    logState: { update: jest.fn() },
  };
  const signer = new SthSignerService();
  const sign = jest.spyOn(signer, "sign").mockReturnValue("ff".repeat(64));
  const service = new LogAppendService(signer);
  const append = (entry: SignedEntry) =>
    service.append(tx as unknown as Parameters<LogAppendService["append"]>[0], entry);
  return { tx, sign, append };
}

describe("LogAppendService", () => {
  it.each(entries)("indexes and preserves the signed $payload.action entry", async (entry) => {
    const { tx, append } = setup([{ treeSize: 1 }], [{ leafIndex: 0, leafHash: "ab".repeat(32) }]);
    const result = await append(entry);
    expect(result.leafIndex).toBe(1);
    expect(tx.logEntry.create).toHaveBeenCalledWith({
      data: {
        type: entry.payload.action,
        orgId: base.orgId,
        actorId: base.signerId,
        keyFingerprint: base.signerKeyFingerprint,
        documentId: base.documentId,
        entryBytes: canonicalBytes(entry),
        leafIndex: 1,
        leafHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
  });

  it.each([
    { state: [], rows: [] },
    { state: [{ treeSize: 1 }], rows: [] },
    { state: [{ treeSize: 1 }], rows: [{ leafIndex: 1, leafHash: "ab".repeat(32) }] },
  ])("rejects missing or noncontiguous log state before signing (%#)", async ({ state, rows }) => {
    const { tx, sign, append } = setup(state, rows);
    await expect(append(entries[0])).rejects.toThrow(/log state/);
    expect(sign).not.toHaveBeenCalled();
    expect(tx.logEntry.create).not.toHaveBeenCalled();
  });
});
