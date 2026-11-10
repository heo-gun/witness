import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PasswordService } from "./password.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [PasswordService, AuthService],
  exports: [PasswordService],
})
export class AuthModule {}
