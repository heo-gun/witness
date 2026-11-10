import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PrismaService } from "../prisma/prisma.service.js";
import type { RegisterDto } from "./dto/register.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { PasswordService } from "./password.service.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

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
