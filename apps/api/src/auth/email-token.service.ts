import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import type { EmailTokenPurpose } from "../generated/prisma/client.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI metadata.
import { PrismaService } from "../prisma/prisma.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI metadata.
import { PasswordService } from "./password.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI metadata.
import { MailService } from "./mail.service.js";
import type { ChangePasswordDto, ConsumeEmailTokenDto } from "./dto/email-token.dto.js";

const LIFETIME = 15 * 60_000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

@Injectable()
export class EmailTokenService {
  private readonly logger = new Logger(EmailTokenService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
  ) {}

  async request(email: string, purpose: EmailTokenPurpose): Promise<void> {
    const token = randomBytes(32).toString("hex");
    const userId = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${email} FOR UPDATE`;
      if (!rows[0]) return null;
      const user = await tx.user.findUniqueOrThrow({ where: { id: rows[0].id } });
      if (purpose === "verify_email" && user.emailVerifiedAt) return null;
      const previous = await tx.emailToken.findUnique({
        where: { userId_purpose: { userId: user.id, purpose } },
      });
      // Per-account cooldown also applies when requests come from different IPs.
      if (previous && previous.expiresAt.getTime() > Date.now() + LIFETIME - 60_000) return null;
      await tx.emailToken.upsert({
        where: { userId_purpose: { userId: user.id, purpose } },
        create: {
          userId: user.id,
          purpose,
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + LIFETIME),
        },
        update: { tokenHash: hash(token), expiresAt: new Date(Date.now() + LIFETIME) },
      });
      return user.id;
    });
    if (!userId) return;
    try {
      await this.mail.send(email, token, purpose);
    } catch {
      await this.prisma.emailToken.deleteMany({
        where: { userId, purpose, tokenHash: hash(token) },
      });
      // Keep the public response identical for missing accounts and delivery failures.
      this.logger.error("Authentication email delivery failed; check mail configuration");
    }
  }

  async consume(input: ConsumeEmailTokenDto): Promise<void> {
    const tokenHash = hash(input.token);
    const candidate = await this.prisma.emailToken.findUnique({ where: { tokenHash } });
    if (
      !candidate ||
      candidate.purpose !== input.purpose ||
      candidate.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException("Invalid or expired email token");
    }
    const passwordHash = await this.passwords.hash(input.password);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate.userId} FOR UPDATE`;
        const current = await tx.emailToken.findUnique({ where: { tokenHash } });
        if (
          !current ||
          current.purpose !== input.purpose ||
          current.expiresAt.getTime() <= Date.now()
        ) {
          throw new BadRequestException("Invalid or expired email token");
        }
        const user = await tx.user.findUniqueOrThrow({ where: { id: current.userId } });
        if (
          (!user.emailVerifiedAt && (await tx.membership.count({ where: { userId: user.id } }))) ||
          (await tx.memberKey.count({
            where: { userId: user.id, status: { in: ["pending", "active"] } },
          }))
        ) {
          throw new ConflictException("Existing memberships or keys require manual recovery");
        }
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
            tokenVersion: { increment: 1 },
          },
        });
        await tx.emailToken.deleteMany({ where: { userId: user.id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async changePassword(userId: string, input: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, input.currentPassword)))
      throw new UnauthorizedException("Invalid password");
    const passwordHash = await this.passwords.hash(input.password);
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: userId, tokenVersion: user.tokenVersion, passwordHash: user.passwordHash },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new UnauthorizedException("Session changed; sign in again");
      await tx.emailToken.deleteMany({ where: { userId } });
    });
  }
}
