import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import type { Role } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
import { lockOrganization } from "./organization-lock.js";

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

  listMembers(orgId: string) {
    return this.prisma.membership.findMany({
      where: { orgId },
      select: MEMBER_SELECT,
      orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
    });
  }

  asOwner<T>(
    orgId: string,
    actorId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await lockOrganization(tx, orgId);
        const actor = await tx.membership.findUnique({
          where: { userId_orgId: { userId: actorId, orgId } },
        });
        if (actor?.role !== "owner") throw new ForbiddenException("Owner role required");
        return operation(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  changeRole(orgId: string, actorId: string, userId: string, role: Role) {
    return this.asOwner(orgId, actorId, async (tx) => {
      const member = await this.getMember(tx, orgId, userId);
      if (member.role !== role) {
        await this.ensureMutable(tx, orgId, userId, member.role);
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
