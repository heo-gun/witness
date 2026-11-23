import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { leafHash, rootFromLeafHashes } from "@tlog/merkle";
import { bytesToHex, canonicalBytes, hexToBytes, type LogEntryData } from "@tlog/shared";
import type { Prisma } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { SthSignerService } from "./sth-signer.service.js";

function entryMetadata(entry: LogEntryData) {
  if ("payload" in entry) {
    const { action, orgId, signerId, documentId, signerKeyFingerprint } = entry.payload;
    return {
      type: action,
      orgId,
      actorId: signerId,
      documentId,
      keyFingerprint: signerKeyFingerprint,
    };
  }
  return {
    type: entry.type,
    orgId: entry.orgId,
    actorId: entry.type === "KEY_REGISTER" ? entry.approvedBy : entry.revokedBy,
    keyFingerprint: entry.fingerprint,
  };
}

@Injectable()
export class LogAppendService {
  constructor(private readonly signer: SthSignerService) {}

  async append(tx: Prisma.TransactionClient & { $connect?: never }, entry: LogEntryData) {
    const [state] = await tx.$queryRaw<{ treeSize: number }[]>`
      SELECT tree_size AS treeSize FROM log_state WHERE id = 1 FOR UPDATE
    `;
    if (!state) throw new InternalServerErrorException("Missing log state");
    const leafIndex = state.treeSize;
    // A caller may already have a REPEATABLE READ snapshot from before it acquired the lock.
    const rows = await tx.$queryRaw<{ leafIndex: number; leafHash: string }[]>`
      SELECT leaf_index AS leafIndex, leaf_hash AS leafHash FROM log_entries
      ORDER BY leaf_index LOCK IN SHARE MODE
    `;
    if (rows.length !== leafIndex || rows.some((row, i) => row.leafIndex !== i)) {
      throw new InternalServerErrorException("Log entries do not match log state");
    }
    const entryBytes = canonicalBytes(entry);
    const hash = leafHash(entryBytes);
    const hashes = rows.map((row) => hexToBytes(row.leafHash, 32));
    hashes.push(hash);
    const timestamp = new Date();
    const head = {
      treeSize: leafIndex + 1,
      timestamp: timestamp.toISOString(),
      rootHash: bytesToHex(rootFromLeafHashes(hashes)),
    };
    const treeHead = { ...head, signature: this.signer.sign(head) };
    await tx.logEntry.create({
      data: { ...entryMetadata(entry), entryBytes, leafHash: bytesToHex(hash), leafIndex },
    });
    await tx.treeHead.create({ data: { ...treeHead, timestamp } });
    await tx.logState.update({ where: { id: 1 }, data: { treeSize: treeHead.treeSize } });
    return { leafIndex, treeHead };
  }
}
