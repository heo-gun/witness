import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PasswordService } from "./password.service.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { JsonRequestGuard } from "./json-request.guard.js";
import { getJwtOptions } from "./session.config.js";
import { SessionService } from "./session.service.js";
import { EmailTokenService } from "./email-token.service.js";
import { MailService } from "./mail.service.js";
import { VerifiedEmailGuard } from "./verified-email.guard.js";

@Module({
  imports: [PrismaModule, JwtModule.registerAsync({ useFactory: getJwtOptions })],
  controllers: [AuthController],
  providers: [
    PasswordService,
    AuthService,
    SessionService,
    JwtAuthGuard,
    JsonRequestGuard,
    EmailTokenService,
    MailService,
    VerifiedEmailGuard,
  ],
  exports: [PasswordService, SessionService, JwtAuthGuard, JsonRequestGuard, VerifiedEmailGuard],
})
export class AuthModule {}
