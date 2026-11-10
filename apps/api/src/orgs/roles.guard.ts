import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { Reflector } from "@nestjs/core";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import type { Role } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
import type { OrganizationRequest } from "./current-org.decorator.js";
import { OrgSlugDto } from "./dto/org-slug.dto.js";
import { ORGANIZATION_SELECT } from "./orgs.service.js";
import { ORG_ROLES } from "./roles.decorator.js";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<OrganizationRequest>();
    if (!req.user) throw new UnauthorizedException();
    const params = plainToInstance(OrgSlugDto, { slug: req.params.slug });
    if (validateSync(params).length > 0) throw new BadRequestException("Invalid organization slug");

    const record = await this.prisma.organization.findUnique({
      where: { slug: params.slug },
      select: {
        ...ORGANIZATION_SELECT,
        memberships: { where: { userId: req.user.id }, select: { role: true } },
      },
    });
    if (!record) throw new NotFoundException("Organization not found");
    const { memberships, ...organization } = record;
    const membership = memberships[0];
    if (!membership) throw new ForbiddenException("Organization membership required");
    const roles = this.reflector.getAllAndOverride<Role[]>(ORG_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(membership.role))
      throw new ForbiddenException("Role not permitted");
    req.organizationContext = { organization, role: membership.role };
    return true;
  }
}
