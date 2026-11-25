import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { JsonRequestGuard } from "../auth/json-request.guard.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { AuthenticatedUser } from "../auth/session.service.js";
import { CurrentOrg, type OrganizationContext } from "../orgs/current-org.decorator.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { OrgSlugDto } from "../orgs/dto/org-slug.dto.js";
import { Roles } from "../orgs/roles.decorator.js";
import { RolesGuard } from "../orgs/roles.guard.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { CreateSignatureRequestDto } from "./dto/create-signature-request.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { SignaturesService } from "./signatures.service.js";

@Controller("orgs/:slug/signature-requests")
@UseGuards(JwtAuthGuard, JsonRequestGuard, RolesGuard)
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Post()
  @Roles("issuer")
  create(
    @Param() _params: OrgSlugDto,
    @CurrentOrg() org: OrganizationContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateSignatureRequestDto,
  ) {
    return this.signatures.create(org.organization.id, actor, input);
  }
}
