import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { SessionUser } from "../auth/session.service.js";
import { requireVerifiedEmail } from "../auth/verified-email.guard.js";
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
  expiresAt: true,
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
        where: { orgId, email: input.email, status: "pending", expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (pending) throw new ConflictException("A pending invitation already exists");
      const token = randomBytes(32).toString("hex");
      const invitation = presentInvitation(
        await tx.invitation.create({
          data: {
            orgId,
            invitedById: actorId,
            email: input.email,
            role: input.role,
            tokenHash: createHash("sha256").update(token).digest("hex"),
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          },
          select: INVITATION_SELECT,
        }),
      );
      return { ...invitation, invitationPath: `/invitations/${invitation.id}#${token}` };
    });
  }

  async listMyInvitations(email: string) {
    const invitations = await this.prisma.invitation.findMany({
      where: { email, status: "pending", expiresAt: { gt: new Date() } },
      select: INVITATION_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return invitations.map(presentInvitation);
  }

  async cancel(orgId: string, actorId: string, id: string) {
    return this.members.asOwner(orgId, actorId, async (tx) => {
      const current = await tx.invitation.findFirst({ where: { id, orgId } });
      if (!current) throw new NotFoundException("Invitation not found");
      if (current.status !== "pending")
        throw new ConflictException("Invitation is no longer pending");
      return presentInvitation(
        await tx.invitation.update({
          where: { id },
          data: { status: "cancelled", tokenHash: null, respondedAt: new Date() },
          select: INVITATION_SELECT,
        }),
      );
    });
  }

  async respond(id: string, user: SessionUser, status: "accepted" | "declined", token: string) {
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
        await requireVerifiedEmail(tx, user.id);
        const current = await tx.invitation.findUnique({ where: { id } });
        if (!current) throw new NotFoundException("Invitation not found");
        if (current.status !== "pending")
          throw new ConflictException("Invitation has already been answered");
        if (!current.tokenHash || !current.expiresAt || current.expiresAt.getTime() <= Date.now())
          throw new ConflictException("Invitation has expired");
        const suppliedHash = createHash("sha256").update(token).digest();
        if (!timingSafeEqual(Buffer.from(current.tokenHash, "hex"), suppliedHash))
          throw new ForbiddenException("Invalid invitation token");
        if (status === "accepted") {
          if (current.role === "owner")
            throw new ForbiddenException("Owner role cannot be granted by invitation");
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
            data: { status, respondedAt: new Date(), tokenHash: null },
            select: INVITATION_SELECT,
          }),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
