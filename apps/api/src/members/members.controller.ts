import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";
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
import { ChangeRoleDto } from "./dto/change-role.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { MemberParamsDto } from "./dto/member-params.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { MembersService } from "./members.service.js";

@Controller("orgs/:slug/members")
@UseGuards(JwtAuthGuard, JsonRequestGuard, RolesGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  listMembers(@Param() _params: OrgSlugDto, @CurrentOrg() context: OrganizationContext) {
    return this.members.listMembers(context.organization.id);
  }

  @Patch(":userId")
  @Roles("owner")
  changeRole(
    @Param() params: MemberParamsDto,
    @CurrentOrg() context: OrganizationContext,
    @CurrentUser() user: SessionUser,
    @Body() input: ChangeRoleDto,
  ) {
    return this.members.changeRole(context.organization.id, user.id, params.userId, input.role);
  }

  @Delete(":userId")
  @HttpCode(204)
  @Roles("owner")
  removeMember(
    @Param() params: MemberParamsDto,
    @CurrentOrg() context: OrganizationContext,
    @CurrentUser() user: SessionUser,
  ) {
    return this.members.removeMember(context.organization.id, user.id, params.userId);
  }
}
