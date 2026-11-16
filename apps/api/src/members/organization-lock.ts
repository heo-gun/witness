import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";

export async function lockOrganization(tx: Prisma.TransactionClient, orgId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM organizations WHERE id = ${orgId} FOR UPDATE
  `;
  if (rows.length === 0) throw new NotFoundException("Organization not found");
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
      const actor = await tx.membership.findUnique({
        where: { userId_orgId: { userId: actorId, orgId } },
      });
      if (actor?.role !== "owner") throw new ForbiddenException("Owner role required");
      return operation(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
