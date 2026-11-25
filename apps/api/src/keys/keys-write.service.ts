import { createHash } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hexToBytes, type KeyPurpose } from "@tlog/shared";
import type { AuthenticatedUser } from "../auth/session.service.js";
import { Prisma, type MemberKey } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { LogAppendService } from "../log/log-append.service.js";
import { lockOrganization, lockUsers, withOwnerTransaction } from "../members/organization-lock.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
import { KEY_SELECT, keyWithDates } from "./keys-read.service.js";

async function requireEligibleMember(
  tx: Prisma.TransactionClient,
  orgId: string,
  userId: string,
  purpose: KeyPurpose,
) {
  const membership = await tx.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true, user: { select: { emailVerifiedAt: true } } },
  });
  if (!membership?.user.emailVerifiedAt)
    throw new ForbiddenException("Verified organization membership required");
  if (purpose === "sign" && membership.role !== "signer")
    throw new ForbiddenException("Signing keys require the signer role");
}

@Injectable()
export class KeysWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly log: LogAppendService,
  ) {}

  register(orgId: string, actor: AuthenticatedUser, purpose: KeyPurpose, publicKey: string) {
    const fingerprint = createHash("sha256").update(hexToBytes(publicKey, 32)).digest("hex");
    return this.prisma.$transaction(
      async (tx) => {
        await lockOrganization(tx, orgId);
        await lockUsers(tx, actor, actor.id);
        await requireEligibleMember(tx, orgId, actor.id, purpose);
        try {
          const key = await tx.memberKey.create({
            data: { orgId, userId: actor.id, purpose, publicKey, fingerprint },
            select: KEY_SELECT,
          });
          return keyWithDates(key);
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
            throw new ConflictException("This public key has already been registered");
          throw error;
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  approve(id: string, actor: AuthenticatedUser) {
    return this.changeAsOwner(id, actor, async (tx, key) => {
      if (key.status !== "pending")
        throw new ConflictException("Only pending keys can be approved");
      const { orgId, userId, purpose, publicKey, fingerprint } = key;
      await requireEligibleMember(tx, orgId, userId, purpose);
      const active = await tx.memberKey.findFirst({
        where: { orgId, userId, purpose, status: "active" },
        select: { id: true },
      });
      if (active)
        throw new ConflictException("Revoke the active key before approving its replacement");
      await tx.memberKey.update({ where: { id }, data: { status: "active" } });
      await this.log.append(tx, {
        type: "KEY_REGISTER",
        orgId,
        userId,
        purpose,
        publicKey,
        fingerprint,
        approvedBy: actor.id,
        approvedAt: new Date().toISOString(),
      });
    });
  }

  revoke(id: string, actor: AuthenticatedUser, reason: string) {
    return this.changeAsOwner(id, actor, async (tx, key) => {
      if (key.status === "revoked") throw new ConflictException("Key is already revoked");
      const { orgId, userId, fingerprint } = key;
      await tx.memberKey.update({ where: { id }, data: { status: "revoked" } });
      if (key.purpose === "encrypt" && key.status === "active") {
        await tx.signatureRequest.updateMany({
          where: {
            orgId,
            signerId: userId,
            status: "pending",
            encryptedFile: { is: { recipientFingerprint: fingerprint, deletedAt: null } },
          },
          data: { status: "needs_resend" },
        });
      }
      await this.log.append(tx, {
        type: "KEY_REVOKE",
        orgId,
        fingerprint,
        revokedBy: actor.id,
        revokedAt: new Date().toISOString(),
        reason,
      });
    });
  }

  private async changeAsOwner(
    id: string,
    actor: AuthenticatedUser,
    change: (tx: Prisma.TransactionClient, key: MemberKey) => Promise<void>,
  ) {
    const scope = await this.prisma.memberKey.findFirst({
      where: { id, org: { memberships: { some: { userId: actor.id } } } },
      select: { orgId: true },
    });
    if (!scope) throw new NotFoundException("Member key not found");
    return withOwnerTransaction(this.prisma, scope.orgId, actor.id, async (tx) => {
      const key = await tx.memberKey.findUnique({ where: { id, orgId: scope.orgId } });
      if (!key) throw new NotFoundException("Member key not found");
      await lockUsers(tx, actor, key.userId);
      await change(tx, key);
      return keyWithDates(
        await tx.memberKey.findUniqueOrThrow({ where: { id }, select: KEY_SELECT }),
      );
    });
  }
}
