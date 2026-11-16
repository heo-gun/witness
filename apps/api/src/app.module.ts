import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { InvitationsModule } from "./invitations/invitations.module.js";
import { MembersModule } from "./members/members.module.js";
import { OrgsModule } from "./orgs/orgs.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [PrismaModule, AuthModule, OrgsModule, MembersModule, InvitationsModule],
})
export class AppModule {}
