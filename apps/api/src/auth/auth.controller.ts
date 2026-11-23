import { Body, Controller, Get, Header, HttpCode, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { AuthService } from "./auth.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { RegisterDto } from "./dto/register.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { LoginDto } from "./dto/login.dto.js";
import { CurrentUser } from "./current-user.decorator.js";
import { JsonRequestGuard } from "./json-request.guard.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { SESSION_COOKIE, SESSION_SECONDS, sessionCookieOptions } from "./session.config.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { SessionService } from "./session.service.js";
import type { SessionUser } from "./session.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI metadata.
import { EmailTokenService } from "./email-token.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires runtime classes.
import {
  RequestEmailTokenDto,
  ConsumeEmailTokenDto,
  ChangePasswordDto,
} from "./dto/email-token.dto.js";

@Controller("auth")
@UseGuards(JsonRequestGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly emailTokens: EmailTokenService,
  ) {}

  @Post("register")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(202)
  @Header("Cache-Control", "no-store")
  async register(@Body() input: RegisterDto) {
    await this.auth.register(input);
    return { accepted: true };
  }

  @Post("email/request")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(202)
  @Header("Cache-Control", "no-store")
  async requestEmail(@Body() input: RequestEmailTokenDto) {
    await this.emailTokens.request(input.email, input.purpose);
    return { accepted: true };
  }

  @Post("email/confirm")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  async confirmEmail(
    @Body() input: ConsumeEmailTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.emailTokens.consume(input);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  }

  @Post("password")
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  async changePassword(
    @CurrentUser() user: SessionUser,
    @Body() input: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.emailTokens.changePassword(user.id, input);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  }

  @Post("login")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async login(@Body() input: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokenVersion } = await this.auth.login(input);
    // Keep the version read before password verification so concurrent logout cannot revive it.
    const token = await this.sessions.issue(user.id, tokenVersion);
    res.cookie(SESSION_COOKIE, token, {
      ...sessionCookieOptions(),
      maxAge: SESSION_SECONDS * 1000,
    });
    return user;
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  async logout(
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revokeAll(user.id);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @Header("Cache-Control", "no-store")
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }
}
