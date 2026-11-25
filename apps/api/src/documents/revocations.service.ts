import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { RevokePayload } from "@tlog/shared";
import type { AuthenticatedUser } from "../auth/session.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { LogAppendService } from "../log/log-append.service.js";
import { lockOrganization, lockUsers } from "../members/organization-lock.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
import {
  requireRecentSignature,
  verifyDocumentSignature,
} from "../signatures/document-signature.js";
import type { RevokeDocumentDto } from "./dto/document.dto.js";

@Injectable()
export class RevocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly log: LogAppendService,
  ) {}

  async revoke(id: string, actor: AuthenticatedUser, input: RevokeDocumentDto) {
    const scope = await this.prisma.document.findFirst({
      where: { id, status: { in: ["valid", "revoked"] } },
      select: { orgId: true },
    });
    if (!scope) throw new NotFoundException("Document not found");
    const { orgId } = scope;
    return this.prisma.$transaction(
      async (tx) => {
        await lockOrganization(tx, orgId);
        await lockUsers(tx, actor, actor.id);
        const membership = await tx.membership.findUnique({
          where: { userId_orgId: { userId: actor.id, orgId } },
          select: { role: true },
        });
        if (membership?.role !== "signer") throw new ForbiddenException("Signer role required");
        const document = await tx.document.findFirst({
          where: { id, orgId },
          select: {
            id: true,
            status: true,
            logEntries: { where: { orgId, type: "ISSUE" }, select: { leafIndex: true } },
          },
        });
        if (!document || document.status !== "valid")
          throw new ConflictException("Only a valid document can be revoked");
        const issue = document.logEntries[0];
        if (document.logEntries.length !== 1 || !issue || issue.leafIndex !== input.targetLeafIndex)
          throw new ConflictException("Target leaf differs from the original issue");
        requireRecentSignature(input.signedAt, new Date());
        const key = await tx.memberKey.findFirst({
          where: {
            orgId,
            userId: actor.id,
            purpose: "sign",
            status: "active",
            fingerprint: input.signerKeyFingerprint,
          },
          select: { publicKey: true, fingerprint: true },
        });
        if (!key) throw new ConflictException("Active signing key required");
        const payload: RevokePayload = {
          action: "REVOKE",
          orgId,
          documentId: document.id,
          targetLeafIndex: issue.leafIndex,
          reason: input.reason,
          signerId: actor.id,
          signerKeyFingerprint: key.fingerprint,
          signedAt: input.signedAt,
        };
        verifyDocumentSignature(payload, input.signature, key.publicKey);
        const { leafIndex } = await this.log.append(tx, { payload, signature: input.signature });
        await tx.revocation.create({
          data: {
            documentId: document.id,
            leafIndex,
            targetLeafIndex: issue.leafIndex,
            reason: input.reason,
            revokedById: actor.id,
          },
        });
        await tx.document.update({ where: { id: document.id }, data: { status: "revoked" } });
        return { documentId: document.id, leafIndex };
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
}
