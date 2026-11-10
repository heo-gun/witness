import { Body, Controller, Get, Header, HttpCode, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
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

@Controller("auth")
@UseGuards(JsonRequestGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post("register")
  register(@Body() input: RegisterDto) {
    return this.auth.register(input);
  }

  @Post("login")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async login(@Body() input: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.login(input);
    const token = await this.sessions.issue(user.id);
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
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @Header("Cache-Control", "no-store")
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }
}
