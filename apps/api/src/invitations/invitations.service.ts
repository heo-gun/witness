import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { SessionUser } from "../auth/session.service.js";
import { Prisma } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { MembersService } from "../members/members.service.js";
import { lockOrganization } from "../members/organization-lock.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
import type { InviteMemberDto } from "./dto/invite-member.dto.js";

const INVITATION_SELECT = {
  id: true,
  orgId: true,
  email: true,
  role: true,
  invitedById: true,
  status: true,
  createdAt: true,
  org: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.InvitationSelect;

type SelectedInvitation = Prisma.InvitationGetPayload<{ select: typeof INVITATION_SELECT }>;

function presentInvitation({ invitedById, ...invitation }: SelectedInvitation) {
  return { ...invitation, invitedBy: invitedById };
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
  ) {}

  inviteMember(orgId: string, actorId: string, input: InviteMemberDto) {
    return this.members.asOwner(orgId, actorId, async (tx) => {
      const member = await tx.membership.findFirst({
        where: { orgId, user: { email: input.email } },
        select: { userId: true },
      });
      if (member) throw new ConflictException("User is already a member");
      const pending = await tx.invitation.findFirst({
        where: { orgId, email: input.email, status: "pending" },
        select: { id: true },
      });
      if (pending) throw new ConflictException("A pending invitation already exists");
      return presentInvitation(
        await tx.invitation.create({
          data: { orgId, invitedById: actorId, email: input.email, role: input.role },
          select: INVITATION_SELECT,
        }),
      );
    });
  }

  async listMyInvitations(email: string) {
    const invitations = await this.prisma.invitation.findMany({
      where: { email, status: "pending" },
      select: INVITATION_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return invitations.map(presentInvitation);
  }

  async respond(id: string, user: SessionUser, status: "accepted" | "declined") {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
      select: { orgId: true, email: true },
    });
    if (!invitation) throw new NotFoundException("Invitation not found");
    if (invitation.email !== user.email)
      throw new ForbiddenException("Invitation belongs to another user");

    return this.prisma.$transaction(
      async (tx) => {
        await lockOrganization(tx, invitation.orgId);
        const current = await tx.invitation.findUnique({ where: { id } });
        if (!current) throw new NotFoundException("Invitation not found");
        if (current.status !== "pending")
          throw new ConflictException("Invitation has already been answered");
        if (status === "accepted") {
          const existing = await tx.membership.findUnique({
            where: { userId_orgId: { userId: user.id, orgId: current.orgId } },
          });
          if (existing) throw new ConflictException("User is already a member");
          await tx.membership.create({
            data: { userId: user.id, orgId: current.orgId, role: current.role },
          });
        }
        return presentInvitation(
          await tx.invitation.update({
            where: { id },
            data: { status, respondedAt: new Date() },
            select: INVITATION_SELECT,
          }),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
