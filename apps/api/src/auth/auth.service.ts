import { Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
import type { RegisterDto } from "./dto/register.dto.js";
import type { LoginDto } from "./dto/login.dto.js";
import { publicSessionUser } from "./session.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PasswordService } from "./password.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI metadata.
import { EmailTokenService } from "./email-token.service.js";

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly emailTokens: EmailTokenService,
  ) {}

  async login(input: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const passwordHash =
      user?.passwordHash ??
      (await (this.dummyHash ??= this.passwords.hash("tlog-login-dummy-password")));
    const valid = await this.passwords.verify(passwordHash, input.password);
    if (!user || !valid) throw new UnauthorizedException("Invalid email or password");
    return {
      user: publicSessionUser(user),
      tokenVersion: user.tokenVersion,
    };
  }

  async register(input: RegisterDto) {
    const passwordHash = await this.passwords.hash(input.password);
    const delivery = await this.prisma.$transaction(async (tx) => {
      let user: { id: string; email: string };
      try {
        user = await tx.user.create({
          data: { email: input.email, name: input.name, passwordHash },
          select: { id: true, email: true },
        });
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
          return null;
        throw error;
      }
      return this.emailTokens.reserve(tx, user, "verify_email");
    });
    if (delivery) {
      await this.emailTokens.deliver(delivery);
    } else {
      await this.emailTokens.request(input.email, "registration_attempt");
    }
  }
}
