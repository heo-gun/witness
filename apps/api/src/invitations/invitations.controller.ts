import { Body, Controller, Get, Header, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { JsonRequestGuard } from "../auth/json-request.guard.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { SessionUser } from "../auth/session.service.js";
import { CurrentOrg } from "../orgs/current-org.decorator.js";
import type { OrganizationContext } from "../orgs/current-org.decorator.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { OrgSlugDto } from "../orgs/dto/org-slug.dto.js";
import { Roles } from "../orgs/roles.decorator.js";
import { RolesGuard } from "../orgs/roles.guard.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { InvitationParamsDto } from "./dto/invitation-params.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { InviteMemberDto } from "./dto/invite-member.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { InvitationsService } from "./invitations.service.js";

@Controller()
@UseGuards(JwtAuthGuard, JsonRequestGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post("orgs/:slug/invitations")
  @UseGuards(RolesGuard)
  @Roles("owner")
  inviteMember(
    @Param() _params: OrgSlugDto,
    @CurrentOrg() context: OrganizationContext,
    @CurrentUser() user: SessionUser,
    @Body() input: InviteMemberDto,
  ) {
    return this.invitations.inviteMember(context.organization.id, user.id, input);
  }

  @Get("me/invitations")
  @Header("Cache-Control", "no-store")
  listMyInvitations(@CurrentUser() user: SessionUser) {
    return this.invitations.listMyInvitations(user.email);
  }

  @Post("invitations/:id/accept")
  @HttpCode(200)
  acceptInvitation(@Param() params: InvitationParamsDto, @CurrentUser() user: SessionUser) {
    return this.invitations.respond(params.id, user, "accepted");
  }

  @Post("invitations/:id/decline")
  @HttpCode(200)
  declineInvitation(@Param() params: InvitationParamsDto, @CurrentUser() user: SessionUser) {
    return this.invitations.respond(params.id, user, "declined");
  }
}
