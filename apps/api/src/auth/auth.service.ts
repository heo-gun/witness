import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
import type { RegisterDto } from "./dto/register.dto.js";
import type { LoginDto } from "./dto/login.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PasswordService } from "./password.service.js";

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async login(input: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const passwordHash =
      user?.passwordHash ??
      (await (this.dummyHash ??= this.passwords.hash("tlog-login-dummy-password")));
    const valid = await this.passwords.verify(passwordHash, input.password);
    if (!user || !valid) throw new UnauthorizedException("Invalid email or password");
    return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
  }

  async register(input: RegisterDto) {
    const passwordHash = await this.passwords.hash(input.password);
    try {
      return await this.prisma.user.create({
        data: { email: input.email, name: input.name, passwordHash },
        select: { id: true, email: true, name: true, createdAt: true },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Email is already registered");
      }
      throw error;
    }
  }
}
