import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/session.service.js";
import { lockOrganization, lockUsers } from "../members/organization-lock.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateSignatureRequestDto } from "./dto/create-signature-request.dto.js";

const REQUEST_REFERENCE = { id: true, documentId: true, status: true } as const;

@Injectable()
export class SignaturesService {
  constructor(private readonly prisma: PrismaService) {}

  create(orgId: string, actor: AuthenticatedUser, input: CreateSignatureRequestDto) {
    const { fileHash, title, category, signerId } = input;
    return this.prisma.$transaction(
      async (tx) => {
        await lockOrganization(tx, orgId);
        await lockUsers(tx, actor, signerId);
        const issuer = await tx.membership.findUnique({
          where: { userId_orgId: { userId: actor.id, orgId } },
          select: { role: true },
        });
        if (issuer?.role !== "issuer") throw new ForbiddenException("Issuer role required");

        const existing = await tx.document.findUnique({
          where: { orgId_fileHash: { orgId, fileHash } },
          select: { signatureRequest: { select: { ...REQUEST_REFERENCE, requesterId: true } } },
        });
        if (existing) {
          const previous = existing.signatureRequest;
          const conflict = { statusCode: 409, message: "This file already has a document" };
          if (previous?.requesterId === actor.id) {
            const { id, documentId, status } = previous;
            throw new ConflictException({ ...conflict, existing: { id, documentId, status } });
          }
          throw new ConflictException(conflict);
        }

        const recipient = await tx.memberKey.findFirst({
          where: {
            userId: signerId,
            orgId,
            purpose: "encrypt",
            status: "active",
            user: {
              emailVerifiedAt: { not: null },
              memberships: { some: { orgId, role: "signer" } },
            },
          },
          select: { userId: true },
        });
        if (!recipient || recipient.userId === actor.id)
          throw new BadRequestException(
            "Choose another verified signer with an active encryption key",
          );

        const document = await tx.document.create({
          data: { orgId, issuerId: actor.id, fileHash, title, category },
          select: { id: true },
        });
        return tx.signatureRequest.create({
          data: {
            orgId,
            requesterId: actor.id,
            signerId: recipient.userId,
            documentId: document.id,
          },
          select: REQUEST_REFERENCE,
        });
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
}
