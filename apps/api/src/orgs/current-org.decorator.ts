import { createParamDecorator, ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Organization, Role } from "../generated/prisma/client.js";
import type { SessionRequest } from "../auth/current-user.decorator.js";

export type OrganizationView = Pick<
  Organization,
  "id" | "name" | "slug" | "description" | "externalId" | "createdAt"
>;

export interface OrganizationContext {
  organization: OrganizationView;
  role: Role;
}

export type OrganizationRequest = SessionRequest & { organizationContext?: OrganizationContext };

export const CurrentOrg = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const org = context.switchToHttp().getRequest<OrganizationRequest>().organizationContext;
  if (!org) throw new ForbiddenException("Organization membership required");
  return org;
});
