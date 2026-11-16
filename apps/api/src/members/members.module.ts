import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OrgsModule } from "../orgs/orgs.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { MembersController } from "./members.controller.js";
import { MembersService } from "./members.service.js";

@Module({
  imports: [AuthModule, OrgsModule, PrismaModule],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
