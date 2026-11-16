import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";

export async function lockOrganization(tx: Prisma.TransactionClient, orgId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM organizations WHERE id = ${orgId} FOR UPDATE
  `;
  if (rows.length === 0) throw new NotFoundException("Organization not found");
}
