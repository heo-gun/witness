import { createParamDecorator, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "./session.service.js";

export type SessionRequest = Request & { user?: AuthenticatedUser };

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const user = context.switchToHttp().getRequest<SessionRequest>().user;
  if (!user) throw new UnauthorizedException();
  return user;
});
