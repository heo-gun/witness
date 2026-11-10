import { SetMetadata } from "@nestjs/common";
import type { Role } from "../generated/prisma/client.js";

export const ORG_ROLES = Symbol("org-roles");
export const Roles = (...roles: Role[]) => SetMetadata(ORG_ROLES, roles);
