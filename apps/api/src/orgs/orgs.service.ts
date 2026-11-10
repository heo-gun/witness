import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateOrgDto } from "./dto/create-org.dto.js";
import type { UpdateOrgDto } from "./dto/update-org.dto.js";

export const ORGANIZATION_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  externalId: true,
  createdAt: true,
} satisfies Prisma.OrganizationSelect;

@Injectable()
export class OrgsService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrg(userId: string, input: CreateOrgDto) {
    try {
      return await this.prisma.organization.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description ?? "",
          memberships: { create: { userId, role: "owner" } },
        },
        select: ORGANIZATION_SELECT,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Organization slug is already in use");
      }
      throw error;
    }
  }

  listOrgs(userId: string) {
    return this.prisma.organization.findMany({
      where: { memberships: { some: { userId } } },
      select: ORGANIZATION_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async updateOrg(orgId: string, input: UpdateOrgDto) {
    if (input.name === undefined && input.description === undefined) {
      throw new BadRequestException("At least one organization field is required");
    }
    try {
      return await this.prisma.organization.update({
        where: { id: orgId },
        data: { name: input.name, description: input.description },
        select: ORGANIZATION_SELECT,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundException("Organization not found");
      }
      throw error;
    }
  }
}
