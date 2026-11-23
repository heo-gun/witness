import { Injectable, UnauthorizedException } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { JwtService } from "@nestjs/jwt";
import { isUUID } from "class-validator";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  emailVerifiedAt: Date | null;
}

export interface AuthenticatedUser extends SessionUser {
  tokenVersion: number;
}

export function publicSessionUser({
  id,
  email,
  name,
  createdAt,
  emailVerifiedAt,
}: SessionUser): SessionUser {
  return { id, email, name, createdAt, emailVerifiedAt };
}

@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  issue(userId: string, tokenVersion: number): Promise<string> {
    return this.jwt.signAsync({ sub: userId, ver: tokenVersion });
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token);
    } catch {
      throw new UnauthorizedException("Invalid session");
    }
    if (
      typeof payload.sub !== "string" ||
      !isUUID(payload.sub) ||
      typeof payload.exp !== "number" ||
      typeof payload.ver !== "number" ||
      !Number.isSafeInteger(payload.ver) ||
      payload.ver < 0
    ) {
      throw new UnauthorizedException("Invalid session");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        tokenVersion: true,
        emailVerifiedAt: true,
      },
    });
    if (!user || user.tokenVersion !== payload.ver)
      throw new UnauthorizedException("Invalid session");
    return user;
  }
}
