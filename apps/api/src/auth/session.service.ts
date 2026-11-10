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
}

@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  issue(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId });
  }

  async authenticate(token: string): Promise<SessionUser> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token);
    } catch {
      throw new UnauthorizedException("Invalid session");
    }
    if (
      typeof payload.sub !== "string" ||
      !isUUID(payload.sub) ||
      typeof payload.exp !== "number"
    ) {
      throw new UnauthorizedException("Invalid session");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!user) throw new UnauthorizedException("Invalid session");
    return user;
  }
}
