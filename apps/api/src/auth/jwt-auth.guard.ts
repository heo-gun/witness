import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { parseCookie } from "cookie";
import type { SessionRequest } from "./current-user.decorator.js";
import { SESSION_COOKIE } from "./session.config.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { SessionService } from "./session.service.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SessionRequest>();
    const token = parseCookie(req.headers.cookie ?? "")[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException("Authentication required");
    req.user = await this.sessions.authenticate(token);
    return true;
  }
}
