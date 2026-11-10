import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { OrgsModule } from "./orgs/orgs.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [PrismaModule, AuthModule, OrgsModule],
})
export class AppModule {}
