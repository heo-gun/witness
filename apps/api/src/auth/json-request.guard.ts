import { ForbiddenException, Injectable, UnsupportedMediaTypeException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

@Injectable()
export class JsonRequestGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
    if (req.get("sec-fetch-site") === "cross-site") throw new ForbiddenException();
    if (!req.is("application/json")) throw new UnsupportedMediaTypeException("JSON required");
    return true;
  }
}
