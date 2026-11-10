import { Body, Controller, Post } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { AuthService } from "./auth.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires the runtime DTO class.
import { RegisterDto } from "./dto/register.dto.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() input: RegisterDto) {
    return this.auth.register(input);
  }
}
