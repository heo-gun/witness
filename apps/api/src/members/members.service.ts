import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, Role } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
import { withOwnerTransaction } from "./organization-lock.js";
import { requireVerifiedEmail } from "../auth/verified-email.guard.js";

const MEMBER_SELECT = {
  userId: true,
  orgId: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.MembershipSelect;

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async listMembers(orgId: string) {
    const members = await this.prisma.membership.findMany({
      where: { orgId },
      select: {
        ...MEMBER_SELECT,
        user: {
          select: {
            ...MEMBER_SELECT.user.select,
            emailVerifiedAt: true,
            _count: {
              select: { memberKeys: { where: { orgId, purpose: "encrypt", status: "active" } } },
            },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
    });
    return members.map(({ user: { emailVerifiedAt, _count, ...user }, ...member }) => ({
      ...member,
      user,
      canReceiveSignatureRequest:
        member.role === "signer" && !!emailVerifiedAt && _count.memberKeys > 0,
    }));
  }

  asOwner<T>(
    orgId: string,
    actorId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return withOwnerTransaction(this.prisma, orgId, actorId, operation);
  }

  changeRole(orgId: string, actorId: string, userId: string, role: Role) {
    return this.asOwner(orgId, actorId, async (tx) => {
      const member = await this.getMember(tx, orgId, userId);
      await requireVerifiedEmail(tx, userId);
      if (member.role !== role) {
        await this.ensureMutable(tx, orgId, userId, member.role);
        await tx.auditLog.create({
          data: {
            orgId,
            actorId,
            action: "MEMBER_ROLE_CHANGED",
            targetType: "membership",
            targetId: userId,
            metadata: { previousRole: member.role, role },
          },
        });
      }
      return tx.membership.update({
        where: { userId_orgId: { userId, orgId } },
        data: { role },
        select: MEMBER_SELECT,
      });
    });
  }

  async removeMember(orgId: string, actorId: string, userId: string): Promise<void> {
    await this.asOwner(orgId, actorId, async (tx) => {
      const member = await this.getMember(tx, orgId, userId);
      await this.ensureMutable(tx, orgId, userId, member.role);
      await tx.membership.delete({ where: { userId_orgId: { userId, orgId } } });
    });
  }

  private async getMember(tx: Prisma.TransactionClient, orgId: string, userId: string) {
    const member = await tx.membership.findUnique({ where: { userId_orgId: { userId, orgId } } });
    if (!member) throw new NotFoundException("Member not found");
    return member;
  }

  private async ensureMutable(
    tx: Prisma.TransactionClient,
    orgId: string,
    userId: string,
    role: Role,
  ) {
    if (
      role === "owner" &&
      (await tx.membership.count({ where: { orgId, role: "owner" } })) === 1
    ) {
      throw new ConflictException("The last owner cannot be removed or demoted");
    }
    const key = await tx.memberKey.findFirst({
      where: { orgId, userId, status: { in: ["pending", "active"] } },
      select: { id: true },
    });
    const pendingRequest = await tx.signatureRequest.findFirst({
      where: {
        orgId,
        OR: [{ requesterId: userId }, { signerId: userId }],
        status: { in: ["awaiting_upload", "pending", "needs_resend"] },
      },
      select: { id: true },
    });
    if (key || pendingRequest) {
      throw new ConflictException(
        "Revoke member keys and resolve pending requests before changing membership",
      );
    }
  }
}
