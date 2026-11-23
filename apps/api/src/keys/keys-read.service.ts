import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { KeyRegisterEntry, KeyRevokeEntry } from "@tlog/shared";
import type { Prisma } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";

export const KEY_SELECT = {
  id: true,
  userId: true,
  orgId: true,
  purpose: true,
  publicKey: true,
  fingerprint: true,
  status: true,
  createdAt: true,
  logEntries: {
    where: { type: { in: ["KEY_REGISTER", "KEY_REVOKE"] } },
    select: { entryBytes: true },
  },
} satisfies Prisma.MemberKeySelect;

export function keyWithDates({
  logEntries,
  ...key
}: Prisma.MemberKeyGetPayload<{ select: typeof KEY_SELECT }>) {
  let approvedAt: string | null = null;
  let revokedAt: string | null = null;
  for (const row of logEntries) {
    const event = JSON.parse(Buffer.from(row.entryBytes).toString("utf8")) as
      KeyRegisterEntry | KeyRevokeEntry;
    if (event.type === "KEY_REGISTER") approvedAt = event.approvedAt;
    if (event.type === "KEY_REVOKE") revokedAt = event.revokedAt;
  }
  return { ...key, approvedAt, revokedAt };
}

@Injectable()
export class KeysReadService {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string, viewerId: string, activeForUserId?: string) {
    // Key state, log dates and membership must come from the same snapshot.
    return this.prisma.$transaction(
      async (tx) => {
        const viewer = await tx.membership.findUnique({
          where: { userId_orgId: { userId: viewerId, orgId } },
          select: { role: true },
        });
        if (!viewer) throw new ForbiddenException("Organization membership required");
        const where: Prisma.MemberKeyWhereInput = { orgId };
        if (activeForUserId !== undefined) {
          const member = await tx.membership.findUnique({
            where: { userId_orgId: { userId: activeForUserId, orgId } },
            select: { role: true, user: { select: { emailVerifiedAt: true } } },
          });
          if (!member) throw new NotFoundException("Member not found");
          if (!member.user.emailVerifiedAt) return [];
          where.userId = activeForUserId;
          where.status = "active";
          if (member.role !== "signer") where.purpose = "encrypt";
        } else if (viewer.role !== "owner") {
          where.userId = viewerId;
        }
        const keys = await tx.memberKey.findMany({
          where,
          select: KEY_SELECT,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        return keys.map(keyWithDates);
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
}
