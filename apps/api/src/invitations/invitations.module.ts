import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { MembersModule } from "../members/members.module.js";
import { OrgsModule } from "../orgs/orgs.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { InvitationsController } from "./invitations.controller.js";
import { InvitationsService } from "./invitations.service.js";

@Module({
  imports: [AuthModule, OrgsModule, PrismaModule, MembersModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
