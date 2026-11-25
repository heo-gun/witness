import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { AuthenticatedUser } from "../auth/session.service.js";
import { VerifiedEmailGuard } from "../auth/verified-email.guard.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { InboxService } from "./inbox.service.js";

@Controller("me/signature-requests")
@UseGuards(JwtAuthGuard, VerifiedEmailGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.inbox.list(user.id);
  }
}
