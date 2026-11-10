import { Body, Controller, Get, Header, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { JsonRequestGuard } from "../auth/json-request.guard.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { SessionUser } from "../auth/session.service.js";
import { CurrentOrg } from "./current-org.decorator.js";
import type { OrganizationContext } from "./current-org.decorator.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { CreateOrgDto } from "./dto/create-org.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { UpdateOrgDto } from "./dto/update-org.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { OrgSlugDto } from "./dto/org-slug.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { OrgsService } from "./orgs.service.js";
import { Roles } from "./roles.decorator.js";
import { RolesGuard } from "./roles.guard.js";

@Controller("orgs")
@UseGuards(JwtAuthGuard, JsonRequestGuard)
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Post()
  createOrg(@CurrentUser() user: SessionUser, @Body() input: CreateOrgDto) {
    return this.orgs.createOrg(user.id, input);
  }

  @Get()
  @Header("Cache-Control", "no-store")
  listOrgs(@CurrentUser() user: SessionUser) {
    return this.orgs.listOrgs(user.id);
  }

  @Get(":slug")
  @Header("Cache-Control", "no-store")
  @UseGuards(RolesGuard)
  getOrg(@Param() _params: OrgSlugDto, @CurrentOrg() context: OrganizationContext) {
    return context.organization;
  }

  @Patch(":slug")
  @UseGuards(RolesGuard)
  @Roles("owner")
  updateOrg(
    @Param() _params: OrgSlugDto,
    @CurrentOrg() context: OrganizationContext,
    @Body() input: UpdateOrgDto,
  ) {
    return this.orgs.updateOrg(context.organization.id, input);
  }
}
