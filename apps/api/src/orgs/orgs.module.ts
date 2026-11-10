import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { OrgsController } from "./orgs.controller.js";
import { OrgsService } from "./orgs.service.js";
import { RolesGuard } from "./roles.guard.js";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [OrgsController],
  providers: [OrgsService, RolesGuard],
  exports: [RolesGuard],
})
export class OrgsModule {}
