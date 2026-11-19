import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { JsonRequestGuard } from "../auth/json-request.guard.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { VerifiedEmailGuard } from "../auth/verified-email.guard.js";
import type { SessionUser } from "../auth/session.service.js";
import { CurrentOrg } from "../orgs/current-org.decorator.js";
import type { OrganizationContext } from "../orgs/current-org.decorator.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { OrgSlugDto } from "../orgs/dto/org-slug.dto.js";
import { Roles } from "../orgs/roles.decorator.js";
import { RolesGuard } from "../orgs/roles.guard.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { InvitationParamsDto, OrgInvitationParamsDto } from "./dto/invitation-params.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { RespondInvitationDto } from "./dto/respond-invitation.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { InviteMemberDto } from "./dto/invite-member.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { InvitationsService } from "./invitations.service.js";

@Controller()
@UseGuards(JwtAuthGuard, JsonRequestGuard, VerifiedEmailGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post("orgs/:slug/invitations")
  @Header("Cache-Control", "no-store")
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
  @UseGuards(ThrottlerGuard)
  @Header("Cache-Control", "no-store")
  @HttpCode(200)
  acceptInvitation(
    @Param() params: InvitationParamsDto,
    @CurrentUser() user: SessionUser,
    @Body() input: RespondInvitationDto,
  ) {
    return this.invitations.respond(params.id, user, "accepted", input.token);
  }

  @Post("invitations/:id/decline")
  @UseGuards(ThrottlerGuard)
  @Header("Cache-Control", "no-store")
  @HttpCode(200)
  declineInvitation(
    @Param() params: InvitationParamsDto,
    @CurrentUser() user: SessionUser,
    @Body() input: RespondInvitationDto,
  ) {
    return this.invitations.respond(params.id, user, "declined", input.token);
  }

  @Delete("orgs/:slug/invitations/:id")
  @UseGuards(RolesGuard)
  @Roles("owner")
  @Header("Cache-Control", "no-store")
  cancelInvitation(
    @Param() params: OrgInvitationParamsDto,
    @CurrentOrg() context: OrganizationContext,
    @CurrentUser() user: SessionUser,
  ) {
    return this.invitations.cancel(context.organization.id, user.id, params.id);
  }
}
