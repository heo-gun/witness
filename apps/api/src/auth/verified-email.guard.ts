import { ForbiddenException, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { SessionRequest } from "./current-user.decorator.js";
import type { Prisma } from "../generated/prisma/client.js";

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!context.switchToHttp().getRequest<SessionRequest>().user?.emailVerifiedAt) {
      throw new ForbiddenException("Email verification required");
    }
    return true;
  }
}

export async function requireVerifiedEmail(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true },
  });
  if (!user?.emailVerifiedAt) throw new ForbiddenException("Email verification required");
}
