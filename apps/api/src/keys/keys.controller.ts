import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { JsonRequestGuard } from "../auth/json-request.guard.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { AuthenticatedUser } from "../auth/session.service.js";
import { VerifiedEmailGuard } from "../auth/verified-email.guard.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { MemberParamsDto } from "../members/dto/member-params.dto.js";
import { CurrentOrg, type OrganizationContext } from "../orgs/current-org.decorator.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { OrgSlugDto } from "../orgs/dto/org-slug.dto.js";
import { RolesGuard } from "../orgs/roles.guard.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires runtime DTO classes.
import { KeyIdDto, RegisterKeyDto, RevokeKeyDto } from "./dto/key.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { KeysReadService } from "./keys-read.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { KeysWriteService } from "./keys-write.service.js";

@Controller()
@UseGuards(JwtAuthGuard, JsonRequestGuard, VerifiedEmailGuard)
export class KeysController {
  constructor(
    private readonly read: KeysReadService,
    private readonly write: KeysWriteService,
  ) {}

  @Post("orgs/:slug/keys")
  @UseGuards(RolesGuard)
  register(
    @Param() _params: OrgSlugDto,
    @CurrentOrg() org: OrganizationContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: RegisterKeyDto,
  ) {
    return this.write.register(org.organization.id, actor, input.purpose, input.publicKey);
  }

  @Get("orgs/:slug/keys")
  @Header("Cache-Control", "no-store")
  @UseGuards(RolesGuard)
  list(
    @Param() _params: OrgSlugDto,
    @CurrentOrg() org: OrganizationContext,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.read.list(org.organization.id, actor.id);
  }

  @Get("orgs/:slug/members/:userId/keys")
  @Header("Cache-Control", "no-store")
  @UseGuards(RolesGuard)
  active(
    @Param() params: MemberParamsDto,
    @CurrentOrg() org: OrganizationContext,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.read.list(org.organization.id, actor.id, params.userId);
  }

  @Post("keys/:id/approve")
  @HttpCode(200)
  approve(
    @Param() params: KeyIdDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: unknown,
  ) {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length !== 0
    ) {
      throw new BadRequestException("Approval requires an empty JSON object");
    }
    return this.write.approve(params.id, actor);
  }

  @Post("keys/:id/revoke")
  @HttpCode(200)
  revoke(
    @Param() params: KeyIdDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: RevokeKeyDto,
  ) {
    return this.write.revoke(params.id, actor, input.reason);
  }
}
