import { ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/session.service.js";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { requireVerifiedEmail } from "../auth/verified-email.guard.js";

export async function lockOrganization(tx: Prisma.TransactionClient, orgId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM organizations WHERE id = ${orgId} FOR UPDATE
  `;
  if (rows.length === 0) throw new NotFoundException("Organization not found");
}

export async function lockUsers(
  tx: Prisma.TransactionClient,
  actor: AuthenticatedUser,
  targetId: string,
) {
  // Recovery locks this same user row. Use primary-key order when two people are involved.
  const users = await tx.$queryRaw<{ id: string; tokenVersion: number; verifiedAt: Date | null }[]>`
    SELECT id, token_version AS tokenVersion, email_verified_at AS verifiedAt FROM users
    WHERE id IN (${actor.id}, ${targetId}) ORDER BY id FOR UPDATE
  `;
  const current = users.find((user) => user.id === actor.id);
  if (!current || current.tokenVersion !== actor.tokenVersion)
    throw new UnauthorizedException("Session changed; sign in again");
  if (!current.verifiedAt) throw new ForbiddenException("Email verification required");
}

export function withOwnerTransaction<T>(
  prisma: PrismaService,
  orgId: string,
  actorId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await lockOrganization(tx, orgId);
      await requireVerifiedEmail(tx, actorId);
      const actor = await tx.membership.findUnique({
        where: { userId_orgId: { userId: actorId, orgId } },
      });
      if (actor?.role !== "owner") throw new ForbiddenException("Owner role required");
      return operation(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
